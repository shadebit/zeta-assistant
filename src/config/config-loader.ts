import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { ZetaConfig, ZetaSettings } from '../types/index.js';

const DEFAULT_ZETA_DIR = join(homedir(), '.zeta');
const REQUIRED_SUBDIRS = ['whatsapp-session', 'logs', 'scripts'] as const;
const SETTINGS_FILE = 'settings.json';

const DEFAULT_SETTINGS: ZetaSettings = {
  maxIterations: 5,
};

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

export function loadSettings(settingsPath: string): ZetaSettings {
  if (!existsSync(settingsPath)) {
    writeFileSync(settingsPath, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf-8');
    return { ...DEFAULT_SETTINGS };
  }

  try {
    const raw = readFileSync(settingsPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<ZetaSettings>;

    return {
      maxIterations:
        typeof parsed.maxIterations === 'number' && parsed.maxIterations > 0
          ? parsed.maxIterations
          : DEFAULT_SETTINGS.maxIterations,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settingsPath: string, settings: ZetaSettings): void {
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
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
    settingsPath: join(zetaDir, SETTINGS_FILE),
  };
}
