import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import qrcode from 'qrcode-terminal';
import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { WinstonLogger } from '../logger/index.js';
import type { ZetaConfig } from '../types/index.js';

// whatsapp-web.js exports Client as a CJS value, not a type — need InstanceType.
type WhatsappWebClient = InstanceType<typeof Client>;

export interface AudioData {
  readonly data: string;
  readonly mimetype: string;
}

export type MessageHandler = (sender: string, body: string, audio?: AudioData) => void;

export interface WhatsappClientOptions {
  readonly config: ZetaConfig;
  readonly resetSession: boolean;
  readonly onMessage?: MessageHandler;
}

export class WhatsappClient {
  private readonly client: WhatsappWebClient;
  private readonly logger = new WinstonLogger(WhatsappClient.name);
  private readonly sessionPath: string;
  // Tracks messages sent by the bot itself to prevent re-processing and infinite loops.
  private readonly sentByBot = new Set<string>();
  private isReady = false;

  constructor(options: WhatsappClientOptions) {
    this.sessionPath = options.config.whatsappSessionPath;

    if (options.resetSession) {
      this.clearSession();
    }

    this.removeStaleLocks();

    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: this.sessionPath,
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      },
    });

    this.registerEventHandlers(options.onMessage);
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing WhatsApp Web client...');
    await this.client.initialize();
  }

  async destroy(): Promise<void> {
    this.logger.info('Shutting down WhatsApp Web client...');
    try {
      await this.client.destroy();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error during shutdown: ${message}`);
    }
  }

  getIsReady(): boolean {
    return this.isReady;
  }

  private clearSession(): void {
    this.logger.warn('Resetting WhatsApp session (will require new QR scan)...');
    try {
      rmSync(this.sessionPath, { recursive: true, force: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to clear session: ${message}`);
    }
  }

  private removeStaleLocks(): void {
    const lockFiles = [
      join(this.sessionPath, 'session', 'SingletonLock'),
      join(this.sessionPath, 'session', 'SingletonSocket'),
      join(this.sessionPath, 'session', 'SingletonCookie'),
    ];

    for (const lockFile of lockFiles) {
      if (existsSync(lockFile)) {
        try {
          rmSync(lockFile, { force: true });
          this.logger.debug(`Removed stale lock: ${lockFile}`);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Could not remove lock file ${lockFile}: ${message}`);
        }
      }
    }

    this.killOrphanedChrome();
  }

  private killOrphanedChrome(): void {
    try {
      // Find Chrome processes using this session directory
      const result = execSync(
        `ps aux | grep -i "chrome" | grep "${this.sessionPath}" | grep -v grep | awk '{print $2}'`,
        { encoding: 'utf-8' },
      );

      const pids = result.trim().split('\n').filter(Boolean);

      if (pids.length > 0) {
        this.logger.debug(`Found ${String(pids.length)} orphaned Chrome process(es), killing...`);
        for (const pid of pids) {
          execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
        }
        // Give OS time to clean up
        execSync('sleep 1', { stdio: 'ignore' });
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_) {
      // Ignore errors — Chrome might not be running, which is fine
    }
  }

  private registerEventHandlers(onMessage?: MessageHandler): void {
    this.client.on('qr', (qr: string) => {
      this.logger.info('QR code received. Scan with WhatsApp on your phone:');
      qrcode.generate(qr, { small: true });
    });

    this.client.on('ready', () => {
      this.isReady = true;
      const info = this.client.info as { wid: { _serialized: string } } | undefined;
      const owner = info?.wid._serialized ?? 'unknown';
      this.logger.info(`Client is ready. Owner: ${owner}`);
    });

    this.client.on('authenticated', () => {
      this.logger.info('Session authenticated successfully.');
    });

    this.client.on('auth_failure', (msg: string) => {
      this.isReady = false;
      this.logger.error(`Authentication failed: ${msg}`);
    });

    this.client.on('disconnected', (reason: string) => {
      this.isReady = false;
      this.logger.warn(`Disconnected: ${reason}`);
    });

    this.client.on(
      'message_create',
      (msg: {
        from: string;
        fromMe: boolean;
        body: string;
        hasMedia: boolean;
        type: string;
        downloadMedia: () => Promise<{ data: string; mimetype: string }>;
      }) => {
        if (!msg.fromMe) {
          return;
        }

        if (this.sentByBot.has(msg.body)) {
          this.sentByBot.delete(msg.body);
          return;
        }

        if (msg.hasMedia && (msg.type === 'ptt' || msg.type === 'audio')) {
          void msg
            .downloadMedia()
            .then((media) => {
              this.logger.info('Audio message from owner received.');
              onMessage?.(msg.from, '', { data: media.data, mimetype: media.mimetype });
            })
            .catch((err: unknown) => {
              const errMsg = err instanceof Error ? err.message : String(err);
              this.logger.error(`Failed to download audio: ${errMsg}`);
            });
          return;
        }

        if (!msg.body) {
          return;
        }

        this.logger.info(`Message from owner: ${msg.body}`);
        onMessage?.(msg.from, msg.body);
      },
    );
  }

  async sendMessage(to: string, text: string): Promise<void> {
    const formatted = `Zeta: ${text}`;
    this.sentByBot.add(formatted);
    await this.client.sendMessage(to, formatted);
  }

  async sendMedia(to: string, filePath: string, caption?: string): Promise<void> {
    const media = MessageMedia.fromFilePath(filePath);
    const formatted = caption ? `Zeta: ${caption}` : '';
    if (formatted) {
      this.sentByBot.add(formatted);
    }
    await this.client.sendMessage(to, media, { caption: formatted || undefined });
  }
}

export async function initWhatsapp(options: WhatsappClientOptions): Promise<WhatsappClient> {
  const client = new WhatsappClient(options);
  await client.initialize();
  return client;
}
