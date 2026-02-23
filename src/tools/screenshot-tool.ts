import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { WinstonLogger } from '../logger/index.js';
import type { CommandResult } from '../types/index.js';

const SCREENSHOTS_DIR = join(homedir(), '.zeta', 'screenshots');
const PERMISSION_HINT =
  'Fix: Open System Settings → Privacy & Security → Screen Recording → enable the terminal/app running Zeta, then restart it.';

export class ScreenshotTool {
  private readonly logger = new WinstonLogger(ScreenshotTool.name);

  run(params: Record<string, unknown>): CommandResult {
    const filename =
      typeof params['filename'] === 'string'
        ? params['filename']
        : `screenshot-${String(Date.now())}.png`;

    const filePath = join(SCREENSHOTS_DIR, filename);
    const description = `screenshot: ${filename}`;

    if (!this.hasGuiSession()) {
      const err = `No GUI display available. screencapture requires a logged-in macOS GUI session with Screen Recording permission. ${PERMISSION_HINT}`;
      this.logger.error(err);
      return { command: description, stdout: '', stderr: err, exitCode: 1 };
    }

    try {
      execSync(`mkdir -p "${SCREENSHOTS_DIR}"`);
      execSync(`screencapture -x "${filePath}"`, { timeout: 10_000 });

      if (!existsSync(filePath)) {
        const err = `Screenshot file was not created. ${PERMISSION_HINT}`;
        return { command: description, stdout: '', stderr: err, exitCode: 1 };
      }

      this.logger.info(`Screenshot saved to ${filePath}`);
      return { command: description, stdout: filePath, stderr: '', exitCode: 0 };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      const hint = msg.includes('could not create image') ? `${msg}\n\n${PERMISSION_HINT}` : msg;
      this.logger.error(`Screenshot failed: ${hint}`);
      return { command: description, stdout: '', stderr: hint, exitCode: 1 };
    }
  }

  private hasGuiSession(): boolean {
    try {
      const result = execSync('ps aux | grep -i WindowServer | grep -v grep', {
        timeout: 3_000,
        encoding: 'utf-8',
      });
      return result.trim().length > 0;
    } catch {
      return false;
    }
  }
}
