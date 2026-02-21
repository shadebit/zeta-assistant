import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import { rmSync } from 'node:fs';
import { WinstonLogger } from '../logger/index.js';
import type { ZetaConfig } from '../types/index.js';

// whatsapp-web.js exports Client as a CJS value, not a type — need InstanceType.
type WhatsappWebClient = InstanceType<typeof Client>;

export type MessageHandler = (sender: string, body: string) => void;

export interface WhatsappClientOptions {
  readonly config: ZetaConfig;
  readonly resetSession: boolean;
  readonly onMessage?: MessageHandler;
}

export class WhatsappClient {
  private readonly client: WhatsappWebClient;
  private readonly logger = new WinstonLogger(WhatsappClient.name);
  private isReady = false;

  constructor(options: WhatsappClientOptions) {
    if (options.resetSession) {
      this.clearSession(options.config.whatsappSessionPath);
    }

    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: options.config.whatsappSessionPath,
      }),
      puppeteer: {
        headless: true,
        args: ['--disable-dev-shm-usage', '--disable-gpu'],
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

  private clearSession(sessionPath: string): void {
    this.logger.warn('Resetting WhatsApp session (will require new QR scan)...');
    try {
      rmSync(sessionPath, { recursive: true, force: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to clear session: ${message}`);
    }
  }

  private registerEventHandlers(onMessage?: MessageHandler): void {
    this.client.on('qr', (qr: string) => {
      this.logger.info('QR code received. Scan with WhatsApp on your phone:');
      qrcode.generate(qr, { small: true });
    });

    this.client.on('ready', () => {
      this.isReady = true;
      this.logger.info('Client is ready and connected.');
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

    this.client.on('message', (msg: { from: string; body: string }) => {
      this.logger.info(`Message from ${msg.from}: ${msg.body}`);
      onMessage?.(msg.from, msg.body);
    });
  }
}

export async function initWhatsapp(options: WhatsappClientOptions): Promise<WhatsappClient> {
  const client = new WhatsappClient(options);
  await client.initialize();
  return client;
}
