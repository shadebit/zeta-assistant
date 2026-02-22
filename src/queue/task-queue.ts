import Database from 'better-sqlite3';
import { WinstonLogger } from '../logger/index.js';

type TaskStatus = 'pending' | 'running' | 'done' | 'failed';

export interface Task {
  readonly id: number;
  readonly sender: string;
  readonly message: string;
  readonly status: TaskStatus;
  readonly previous_context: string;
  readonly result: string;
  readonly created_at: string;
}

export class TaskQueue {
  private readonly db: Database.Database;
  private readonly logger = new WinstonLogger(TaskQueue.name);
  private processing = false;
  private onProcess?: (task: Task) => Promise<string>;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.createTable();
    this.recoverStuckTasks();
  }

  private createTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        previous_context TEXT NOT NULL DEFAULT '',
        result TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  private recoverStuckTasks(): void {
    const stuck = this.db
      .prepare(`UPDATE tasks SET status = 'pending' WHERE status = 'running'`)
      .run();

    if (stuck.changes > 0) {
      this.logger.warn(`Recovered ${String(stuck.changes)} stuck task(s) back to pending.`);
    }
  }

  setProcessor(handler: (task: Task) => Promise<string>): void {
    this.onProcess = handler;
    this.logger.info('Processor registered. Draining pending tasks...');
    void this.processNext();
  }

  enqueue(sender: string, message: string): number {
    const result = this.db
      .prepare(`INSERT INTO tasks (sender, message) VALUES (?, ?)`)
      .run(sender, message);

    const taskId = Number(result.lastInsertRowid);
    this.logger.info(`Task #${String(taskId)} enqueued: "${message.slice(0, 80)}"`);

    if (!this.onProcess) {
      this.logger.warn(`Task #${String(taskId)} queued but processor not yet registered.`);
    }

    void this.processNext();
    return taskId;
  }

  private getLastCompletedContext(): string {
    const row = this.db
      .prepare(`SELECT result FROM tasks WHERE status = 'done' ORDER BY id DESC LIMIT 1`)
      .get() as { result: string } | undefined;

    return row?.result ?? '';
  }

  private async processNext(): Promise<void> {
    if (this.processing || !this.onProcess) {
      return;
    }

    const task = this.db
      .prepare(`SELECT * FROM tasks WHERE status = 'pending' ORDER BY id ASC LIMIT 1`)
      .get() as Task | undefined;

    if (!task) {
      return;
    }

    this.processing = true;

    // Resolve context at processing time (not enqueue time) to avoid stale context
    // when multiple messages arrive before the first task finishes.
    const freshContext = this.getLastCompletedContext();
    const taskWithContext = { ...task, previous_context: freshContext };

    this.logger.info(`Processing task #${String(task.id)}: "${task.message.slice(0, 80)}"`);
    this.db
      .prepare(`UPDATE tasks SET status = 'running', previous_context = ? WHERE id = ?`)
      .run(freshContext, task.id);

    try {
      const result = await this.onProcess(taskWithContext);

      this.db
        .prepare(`UPDATE tasks SET status = 'done', result = ? WHERE id = ?`)
        .run(result, task.id);

      this.logger.info(`Task #${String(task.id)} completed.`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.db
        .prepare(`UPDATE tasks SET status = 'failed', result = ? WHERE id = ?`)
        .run(errorMessage, task.id);

      this.logger.error(`Task #${String(task.id)} failed: ${errorMessage}`);
    } finally {
      this.processing = false;
      void this.processNext();
    }
  }

  close(): void {
    this.db.close();
  }
}
