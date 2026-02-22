import { execSync } from 'node:child_process';
import { WinstonLogger } from '../logger/index.js';
import type { CommandResult } from '../types/index.js';

export class KeyboardTool {
  private readonly logger = new WinstonLogger(KeyboardTool.name);

  run(params: Record<string, unknown>): CommandResult {
    const text = typeof params['text'] === 'string' ? params['text'] : '';
    const description = `keyboard_type: "${text.slice(0, 50)}"`;

    if (!text) {
      return { command: description, stdout: '', stderr: 'Text is required', exitCode: 1 };
    }

    try {
      const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      execSync(`osascript -e 'tell application "System Events" to keystroke "${escaped}"'`, {
        timeout: 10_000,
      });

      this.logger.info(description);
      return { command: description, stdout: `Typed: "${text}"`, stderr: '', exitCode: 0 };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Keyboard action failed: ${msg}`);
      return { command: description, stdout: '', stderr: msg, exitCode: 1 };
    }
  }
}
