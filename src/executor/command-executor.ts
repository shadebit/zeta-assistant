import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { WinstonLogger } from '../logger/index.js';
import type { CommandResult } from '../types/index.js';

const execAsync = promisify(exec);
const COMMAND_TIMEOUT_MS = 30_000;

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

      return { command, stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
    } catch (error: unknown) {
      const err = error as { stdout?: string; stderr?: string; code?: number; message?: string };

      return {
        command,
        stdout: err.stdout?.trim() ?? '',
        stderr: err.stderr?.trim() ?? err.message ?? 'Unknown error',
        exitCode: err.code ?? 1,
      };
    }
  }
}
