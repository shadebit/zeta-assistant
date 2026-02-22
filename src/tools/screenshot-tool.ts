import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { WinstonLogger } from '../logger/index.js';
import type { CommandResult } from '../types/index.js';

const SCREENSHOTS_DIR = join(homedir(), '.zeta', 'screenshots');

export class ScreenshotTool {
  private readonly logger = new WinstonLogger(ScreenshotTool.name);

  run(params: Record<string, unknown>): CommandResult {
    const filename =
      typeof params['filename'] === 'string'
        ? params['filename']
        : `screenshot-${String(Date.now())}.png`;

    const filePath = join(SCREENSHOTS_DIR, filename);
    const description = `screenshot: ${filename}`;

    try {
      execSync(`mkdir -p "${SCREENSHOTS_DIR}"`);
      execSync(`screencapture -x "${filePath}"`, { timeout: 10_000 });

      if (!existsSync(filePath)) {
        return {
          command: description,
          stdout: '',
          stderr: 'Screenshot file was not created',
          exitCode: 1,
        };
      }

      this.logger.info(`Screenshot saved to ${filePath}`);
      return { command: description, stdout: filePath, stderr: '', exitCode: 0 };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Screenshot failed: ${msg}`);
      return { command: description, stdout: '', stderr: msg, exitCode: 1 };
    }
  }
}
