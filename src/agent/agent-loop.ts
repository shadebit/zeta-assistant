import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { Planner, buildSystemPrompt } from './planner.js';
import { CommandExecutor } from '../executor/index.js';
import { WinstonLogger } from '../logger/index.js';
import type { ZetaSettings } from '../types/index.js';
import { loadSettings } from '../config/index.js';

const logger = new WinstonLogger('AgentLoop');

export interface AgentResponse {
  readonly reply: string;
  readonly files: readonly string[];
}

export class AgentLoop {
  private readonly planner: Planner;
  private readonly executor = new CommandExecutor();
  private readonly settingsPath: string;

  constructor(apiKey: string, settingsPath: string) {
    this.planner = new Planner(apiKey);
    this.settingsPath = settingsPath;
  }

  async run(userMessage: string, previousContext?: string): Promise<AgentResponse> {
    logger.info(`Running agent loop for: "${userMessage}"`);

    const settings: ZetaSettings = loadSettings(this.settingsPath);
    const maxIterations = settings.maxIterations;
    logger.info(`Max iterations: ${String(maxIterations)}`);

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: buildSystemPrompt() },
    ];

    if (previousContext) {
      messages.push({ role: 'user', content: `Previous task context:\n${previousContext}` });
    }

    messages.push({ role: 'user', content: userMessage });

    const allFiles: string[] = [];

    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      logger.info(`Iteration ${String(iteration)}/${String(maxIterations)}`);

      const plan = await this.planner.next(messages);
      logger.info(`Reasoning: ${plan.reasoning}`);
      allFiles.push(...plan.files);

      messages.push({
        role: 'assistant',
        content: JSON.stringify({
          command: plan.command,
          reasoning: plan.reasoning,
          reply: plan.reply,
          files: plan.files,
          done: plan.done,
        }),
      });

      if (plan.done || !plan.command) {
        logger.info(
          `Agent finished at iteration ${String(iteration)}. Reply: "${plan.reply.slice(0, 100)}"`,
        );
        return { reply: plan.reply || 'Done.', files: allFiles };
      }

      logger.info(`Executing: ${plan.command}`);
      const result = await this.executor.run(plan.command);

      const status = result.exitCode === 0 ? '✓' : '✗';
      const output = result.stdout || result.stderr || '(no output)';
      const resultSummary = `${status} ${result.command}\n${output}`;

      logger.info(`Command result:\n${resultSummary}`);

      messages.push({
        role: 'user',
        content: `Command result:\n${resultSummary}`,
      });
    }

    logger.warn(`Max iterations (${String(maxIterations)}) reached. Forcing final summary.`);

    messages.push({
      role: 'user',
      content:
        'Max iterations reached. Summarise everything you have so far into a final reply. Set "done": true.',
    });

    const finalPlan = await this.planner.next(messages);
    allFiles.push(...finalPlan.files);

    return { reply: finalPlan.reply || 'Done (max iterations reached).', files: allFiles };
  }
}
