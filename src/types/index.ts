export interface ZetaConfig {
  readonly zetaDir: string;
  readonly whatsappSessionPath: string;
  readonly logsDir: string;
  readonly scriptsDir: string;
  readonly dbPath: string;
  readonly settingsPath: string;
}

export interface ZetaSettings {
  readonly maxIterations: number;
  readonly commandTimeoutMs: number;
  readonly maxOutputLength: number;
}

export interface CliArgs {
  readonly resetWhatsapp: boolean;
  readonly help: boolean;
  readonly version: boolean;
  readonly plannerApiKey: string | null;
}

export interface CommandResult {
  readonly command: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export type ToolName =
  | 'shell'
  | 'screenshot'
  | 'mouse_click'
  | 'keyboard_type'
  | 'open_url'
  | 'open_app';

export interface ToolAction {
  readonly tool: ToolName;
  readonly params: Record<string, unknown>;
}

export interface PlannerOutput {
  readonly command: string;
  readonly tool: ToolAction | null;
  readonly reasoning: string;
  readonly reply: string;
  readonly files: readonly string[];
  readonly done: boolean;
}
