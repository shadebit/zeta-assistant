import { homedir } from 'node:os';
import { platform, arch } from 'node:process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';
import { WinstonLogger } from '../logger/index.js';
import type { PlannerOutput } from '../types/index.js';

// o3-mini is the best reasoning/planning model — ideal for batching multi-step actions.
const PLANNER_MODEL = 'o3-mini';

function loadSoulTemplate(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const soulPath = join(currentDir, '..', '..', 'soul.md');
  return readFileSync(soulPath, 'utf-8');
}

function buildSystemPrompt(): string {
  const home = homedir();
  return loadSoulTemplate()
    .replaceAll('{{platform}}', platform)
    .replaceAll('{{arch}}', arch)
    .replaceAll('{{home}}', home);
}

const logger = new WinstonLogger('Planner');

export class Planner {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async plan(userMessage: string): Promise<PlannerOutput> {
    logger.info(`Planning for: ${userMessage}`);

    const response = await this.client.chat.completions.create({
      model: PLANNER_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: userMessage },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    logger.info(`Planner raw response: ${raw}`);

    return parsePlannerOutput(raw);
  }

  async summarise(userMessage: string, commandResults: string): Promise<PlannerOutput> {
    logger.info('Summarising command results...');

    const response = await this.client.chat.completions.create({
      model: PLANNER_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: userMessage },
        {
          role: 'user',
          content: `Command results:\n${commandResults}\n\nBased on these results, return JSON with "reply" (the final answer to the user) and "files" (absolute paths of files to send as attachments, if any). No more commands needed.`,
        },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? '{}';
    logger.info(`Summarise raw response: ${raw}`);

    return parsePlannerOutput(raw);
  }
}

function parsePlannerOutput(raw: string): PlannerOutput {
  try {
    const parsed = JSON.parse(raw) as Partial<PlannerOutput>;

    return {
      commands: Array.isArray(parsed.commands) ? parsed.commands : [],
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
      reply: typeof parsed.reply === 'string' ? parsed.reply : '',
      files: Array.isArray(parsed.files) ? parsed.files : [],
    };
  } catch {
    logger.warn(`Failed to parse planner output, treating as plain reply: ${raw}`);
    return { commands: [], reasoning: '', reply: raw, files: [] };
  }
}
