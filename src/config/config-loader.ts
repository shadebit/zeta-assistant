import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { ZetaConfig } from '../types/index.js';

const DEFAULT_ZETA_DIR = join(homedir(), '.zeta');
const REQUIRED_SUBDIRS = ['whatsapp-session', 'logs', 'scripts'] as const;

export function ensureDirectory(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

export function ensureZetaDirectories(zetaDir: string): void {
  ensureDirectory(zetaDir);
  for (const subdir of REQUIRED_SUBDIRS) {
    ensureDirectory(join(zetaDir, subdir));
  }
}

export function initConfig(): ZetaConfig {
  const zetaDir = DEFAULT_ZETA_DIR;

  ensureZetaDirectories(zetaDir);

  return {
    zetaDir,
    whatsappSessionPath: join(zetaDir, 'whatsapp-session'),
    logsDir: join(zetaDir, 'logs'),
    scriptsDir: join(zetaDir, 'scripts'),
    dbPath: join(zetaDir, 'tasks.db'),
  };
}
