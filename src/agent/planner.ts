import { homedir } from 'node:os';
import { platform, arch } from 'node:process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { WinstonLogger } from '../logger/index.js';
import type { PlannerOutput, ToolAction, ToolName } from '../types/index.js';

const PLANNER_MODEL = 'o3-mini';

function loadSoulTemplate(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const soulPath = join(currentDir, '..', '..', 'soul.md');
  return readFileSync(soulPath, 'utf-8');
}

export function buildSystemPrompt(): string {
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

  async next(messages: ChatCompletionMessageParam[]): Promise<PlannerOutput> {
    logger.info(`Planner call with ${String(messages.length)} message(s)...`);

    const response = await this.client.chat.completions.create({
      model: PLANNER_MODEL,
      response_format: { type: 'json_object' },
      messages,
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    logger.info(`Planner raw response: ${raw}`);

    return parsePlannerOutput(raw);
  }
}

function parsePlannerOutput(raw: string): PlannerOutput {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const command = typeof parsed['command'] === 'string' ? parsed['command'] : '';

    let tool: ToolAction | null = null;
    if (parsed['tool'] && typeof parsed['tool'] === 'object') {
      const t = parsed['tool'] as Record<string, unknown>;
      if (typeof t['tool'] === 'string') {
        tool = {
          tool: t['tool'] as ToolName,
          params:
            typeof t['params'] === 'object' && t['params'] !== null
              ? (t['params'] as Record<string, unknown>)
              : {},
        };
      }
    }

    const done = typeof parsed['done'] === 'boolean' ? parsed['done'] : command === '' && !tool;

    return {
      command,
      tool,
      reasoning: typeof parsed['reasoning'] === 'string' ? parsed['reasoning'] : '',
      reply: typeof parsed['reply'] === 'string' ? parsed['reply'] : '',
      files: Array.isArray(parsed['files']) ? (parsed['files'] as string[]) : [],
      done,
    };
  } catch {
    logger.warn(`Failed to parse planner output, treating as plain reply: ${raw}`);
    return { command: '', tool: null, reasoning: '', reply: raw, files: [], done: true };
  }
}
