import { execSync } from 'node:child_process';
import { WinstonLogger } from '../logger/index.js';
import type { CommandResult } from '../types/index.js';

export class OpenAppTool {
  private readonly logger = new WinstonLogger(OpenAppTool.name);

  run(params: Record<string, unknown>): CommandResult {
    const app = typeof params['app'] === 'string' ? params['app'] : '';
    const description = `open_app: ${app}`;

    if (!app) {
      return { command: description, stdout: '', stderr: 'App name is required', exitCode: 1 };
    }

    try {
      execSync(`open -a "${app}"`, { timeout: 10_000 });
      this.logger.info(description);
      return { command: description, stdout: `Opened ${app}`, stderr: '', exitCode: 0 };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Open app failed: ${msg}`);
      return { command: description, stdout: '', stderr: msg, exitCode: 1 };
    }
  }
}
