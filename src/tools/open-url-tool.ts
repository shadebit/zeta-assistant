import { execSync } from 'node:child_process';
import { WinstonLogger } from '../logger/index.js';
import type { CommandResult } from '../types/index.js';

export class OpenUrlTool {
  private readonly logger = new WinstonLogger(OpenUrlTool.name);

  run(params: Record<string, unknown>): CommandResult {
    const url = typeof params['url'] === 'string' ? params['url'] : '';
    const description = `open_url: ${url}`;

    if (!url) {
      return { command: description, stdout: '', stderr: 'URL is required', exitCode: 1 };
    }

    try {
      execSync(`open "${url}"`, { timeout: 10_000 });
      this.logger.info(description);
      return { command: description, stdout: `Opened ${url}`, stderr: '', exitCode: 0 };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Open URL failed: ${msg}`);
      return { command: description, stdout: '', stderr: msg, exitCode: 1 };
    }
  }
}
