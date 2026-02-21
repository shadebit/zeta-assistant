export interface ZetaConfig {
  readonly zetaDir: string;
  readonly whatsappSessionPath: string;
  readonly logsDir: string;
  readonly scriptsDir: string;
}

export interface CliArgs {
  readonly resetWhatsapp: boolean;
  readonly help: boolean;
  readonly version: boolean;
}
