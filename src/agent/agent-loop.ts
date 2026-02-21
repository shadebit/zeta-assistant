import { Planner } from './planner.js';
import { CommandExecutor } from '../executor/index.js';
import { WinstonLogger } from '../logger/index.js';
import type { CommandResult } from '../types/index.js';

const logger = new WinstonLogger('AgentLoop');

export class AgentLoop {
  private readonly planner: Planner;
  private readonly executor = new CommandExecutor();

  constructor(apiKey: string) {
    this.planner = new Planner(apiKey);
  }

  async run(userMessage: string): Promise<string> {
    logger.info(`Running agent loop for: "${userMessage}"`);

    const plan = await this.planner.plan(userMessage);
    logger.info(`Reasoning: ${plan.reasoning}`);

    if (plan.commands.length === 0) {
      return plan.reply || 'Done.';
    }

    logger.info(`Executing ${String(plan.commands.length)} command(s) in parallel...`);
    const results = await this.executor.run(plan.commands);

    const commandResults = formatCommandResults(results);
    logger.info(`Command results:\n${commandResults}`);

    return this.planner.summarise(userMessage, commandResults);
  }
}

function formatCommandResults(results: readonly CommandResult[]): string {
  return results
    .map((r) => {
      const status = r.exitCode === 0 ? '✓' : '✗';
      const output = r.stdout || r.stderr || '(no output)';
      return `${status} ${r.command}\n${output}`;
    })
    .join('\n\n');
}
