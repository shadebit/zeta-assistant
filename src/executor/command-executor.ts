import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { WinstonLogger } from '../logger/index.js';
import type { CommandResult, ZetaSettings } from '../types/index.js';

const execAsync = promisify(exec);

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}\n...(truncated)` : text;
}

function isBinaryOutput(text: string): boolean {
  return /[\x00-\x08\x0E-\x1F]/.test(text);
}

export class CommandExecutor {
  private readonly logger = new WinstonLogger(CommandExecutor.name);

  async run(command: string, settings: ZetaSettings): Promise<CommandResult> {
    this.logger.warn(`Executing command: ${command}`);

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: settings.commandTimeoutMs,
        encoding: 'utf-8',
        shell: '/bin/bash',
        cwd: homedir(),
        env: { ...process.env, LC_ALL: 'en_US.UTF-8' },
      });

      if (isBinaryOutput(stdout)) {
        return {
          command,
          stdout: '(binary output detected — skipped)',
          stderr: stderr.trim(),
          exitCode: 0,
        };
      }

      return {
        command,
        stdout: truncate(stdout.trim(), settings.maxOutputLength),
        stderr: truncate(stderr.trim(), settings.maxOutputLength),
        exitCode: 0,
      };
    } catch (error: unknown) {
      const err = error as { stdout?: string; stderr?: string; code?: number; message?: string };

      return {
        command,
        stdout: truncate(err.stdout?.trim() ?? '', settings.maxOutputLength),
        stderr: truncate(
          err.stderr?.trim() ?? err.message ?? 'Unknown error',
          settings.maxOutputLength,
        ),
        exitCode: err.code ?? 1,
      };
    }
  }
}
