import { homedir } from 'node:os';
import { platform, arch } from 'node:process';
import OpenAI from 'openai';
import { WinstonLogger } from '../logger/index.js';
import type { PlannerOutput } from '../types/index.js';

// o3-mini is the best reasoning/planning model — ideal for batching multi-step actions.
const PLANNER_MODEL = 'o3-mini';

function buildSystemPrompt(): string {
  return `You are Zeta, an AI assistant that controls a computer via shell commands.

Environment:
- OS: ${platform} (${arch})
- Shell: /bin/bash
- Home directory: ${homedir()}
- Working directory: ${homedir()}

When the user sends a request, you must:
1. Determine ALL commands needed to answer the request in ONE response.
2. Batch all necessary commands together. Prefer fewer, broader commands over many narrow ones.
3. Return a JSON object with this exact shape:

{
  "commands": ["cmd1", "cmd2"],
  "reasoning": "why these commands answer the request",
  "reply": ""
}

If no commands are needed (e.g. a greeting or simple question), return an empty commands array and put the answer directly in reply.

Rules:
- All commands run in /bin/bash from the home directory.
- Use absolute paths or cd into directories explicitly.
- Always prefer read-only commands unless the user explicitly asks to change something.
- Never use sudo unless explicitly requested.
- Do NOT have conversations. You are a task executor, not a chatbot. If the message is just a greeting or casual chat, reply briefly and do not ask follow-up questions.
- The "reply" field is filled AFTER command results are observed. Leave it empty when commands are present.`;
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

  async summarise(userMessage: string, commandResults: string): Promise<string> {
    logger.info('Summarising command results...');

    const response = await this.client.chat.completions.create({
      model: PLANNER_MODEL,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: userMessage },
        {
          role: 'user',
          content: `Command results:\n${commandResults}\n\nNow write the final reply to the user based on these results. Be concise and direct.`,
        },
      ],
    });

    return response.choices[0]?.message?.content?.trim() ?? 'Done.';
  }
}

function parsePlannerOutput(raw: string): PlannerOutput {
  try {
    const parsed = JSON.parse(raw) as Partial<PlannerOutput>;

    return {
      commands: Array.isArray(parsed.commands) ? parsed.commands : [],
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
      reply: typeof parsed.reply === 'string' ? parsed.reply : '',
    };
  } catch {
    logger.warn(`Failed to parse planner output, treating as plain reply: ${raw}`);
    return { commands: [], reasoning: '', reply: raw };
  }
}
