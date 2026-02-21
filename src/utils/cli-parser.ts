import type { CliArgs } from '../types/index.js';

export function parseCliArgs(argv: readonly string[]): CliArgs {
  const args = argv.slice(2);

  return {
    resetWhatsapp: args.includes('--reset-whatsapp'),
    help: args.includes('--help') || args.includes('-h'),
    version: args.includes('--version') || args.includes('-v'),
  };
}

export function getHelpText(): string {
  return `
Usage: zeta-assistant [options]

A locally running AI operator controlled via WhatsApp Web.

Options:
  --reset-whatsapp   Clear saved session and scan a new QR code
  --help, -h         Show this help message
  --version, -v      Show version number

Prerequisites:
  - Node.js >= 20
`.trim();
}
