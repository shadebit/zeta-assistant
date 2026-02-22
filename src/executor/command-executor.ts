import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { WinstonLogger } from '../logger/index.js';
import type { CommandResult } from '../types/index.js';

const execAsync = promisify(exec);
const COMMAND_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_LENGTH = 4000;

function truncate(text: string): string {
  return text.length > MAX_OUTPUT_LENGTH
    ? `${text.slice(0, MAX_OUTPUT_LENGTH)}\n...(truncated)`
    : text;
}

function isBinaryOutput(text: string): boolean {
  return /[\x00-\x08\x0E-\x1F]/.test(text);
}

export class CommandExecutor {
  private readonly logger = new WinstonLogger(CommandExecutor.name);

  async run(commands: readonly string[]): Promise<CommandResult[]> {
    return Promise.all(commands.map((cmd) => this.runOne(cmd)));
  }

  private async runOne(command: string): Promise<CommandResult> {
    this.logger.warn(`Executing command: ${command}`);

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: COMMAND_TIMEOUT_MS,
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
        stdout: truncate(stdout.trim()),
        stderr: truncate(stderr.trim()),
        exitCode: 0,
      };
    } catch (error: unknown) {
      const err = error as { stdout?: string; stderr?: string; code?: number; message?: string };

      return {
        command,
        stdout: truncate(err.stdout?.trim() ?? ''),
        stderr: truncate(err.stderr?.trim() ?? err.message ?? 'Unknown error'),
        exitCode: err.code ?? 1,
      };
    }
  }
}
