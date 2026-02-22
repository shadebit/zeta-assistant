import type { CliArgs } from '../types/index.js';

export function parseCliArgs(argv: readonly string[]): CliArgs {
  const args = argv.slice(2);

  const plannerApiKeyArg = args.find((a) => a.startsWith('--OPEN_AI_API_KEY='));
  const plannerApiKey = plannerApiKeyArg
    ? (plannerApiKeyArg.split('=')[1] ?? null)
    : (process.env['OPEN_AI_API_KEY'] ?? null);

  return {
    resetWhatsapp: args.includes('--reset-whatsapp'),
    help: args.includes('--help') || args.includes('-h'),
    version: args.includes('--version') || args.includes('-v'),
    plannerApiKey,
  };
}

export function getHelpText(): string {
  return `
Usage: zeta-assistant [options]

A locally running AI operator controlled via WhatsApp Web.

Options:
  --OPEN_AI_API_KEY=<key>      OpenAI API key (required). Can also be set via OPEN_AI_API_KEY env var.
  --reset-whatsapp             Clear saved session and scan a new QR code
  --help, -h                   Show this help message
  --version, -v                Show version number

Prerequisites:
  - Node.js >= 20

Examples:
  npx @shadebit/zeta-assistant --OPEN_AI_API_KEY=sk-...
  OPEN_AI_API_KEY=sk-... npx @shadebit/zeta-assistant
`.trim();
}
