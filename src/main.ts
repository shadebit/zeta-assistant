#!/usr/bin/env node

import { createRequire } from 'node:module';
import { initConfig } from './config/index.js';
import { initWhatsapp } from './whatsapp/index.js';
import type { WhatsappClient } from './whatsapp/index.js';
import { parseCliArgs, getHelpText } from './utils/index.js';
import { WinstonLogger, initLoggerTransports } from './logger/index.js';

const logger = new WinstonLogger('Main');

function getVersion(): string {
  const require = createRequire(import.meta.url);
  const pkg = require('../package.json') as { version: string };
  return pkg.version;
}

function initGracefulShutdown(whatsapp: WhatsappClient): void {
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    await whatsapp.destroy();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv);

  if (args.help) {
    console.error(getHelpText());
    process.exit(0);
  }

  if (args.version) {
    console.error(getVersion());
    process.exit(0);
  }

  logger.info(`Zeta Assistant v${getVersion()} starting...`);

  const config = initConfig();
  initLoggerTransports(config.logsDir);
  const whatsapp = await initWhatsapp({
    config,
    resetSession: args.resetWhatsapp,
    onMessage: (sender: string, body: string) => {
      logger.info(`Received message from ${sender}: ${body}`);
    },
  });
  initGracefulShutdown(whatsapp);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`Fatal: ${message}`);
  process.exit(1);
});
