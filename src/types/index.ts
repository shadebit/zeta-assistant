export interface ZetaConfig {
  readonly zetaDir: string;
  readonly whatsappSessionPath: string;
  readonly logsDir: string;
  readonly scriptsDir: string;
  readonly dbPath: string;
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

export interface PlannerOutput {
  readonly commands: readonly string[];
  readonly reasoning: string;
  readonly reply: string;
  readonly files: readonly string[];
}
