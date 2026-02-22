import { execSync } from 'node:child_process';
import { WinstonLogger } from '../logger/index.js';
import type { CommandResult } from '../types/index.js';

export class MouseTool {
  private readonly logger = new WinstonLogger(MouseTool.name);

  run(params: Record<string, unknown>): CommandResult {
    const x = typeof params['x'] === 'number' ? params['x'] : 0;
    const y = typeof params['y'] === 'number' ? params['y'] : 0;
    const action = typeof params['action'] === 'string' ? params['action'] : 'click';
    const description = `mouse_click: ${action} at (${String(x)}, ${String(y)})`;

    try {
      const script = action === 'move' ? this.buildMoveScript(x, y) : this.buildClickScript(x, y);

      execSync(`python3 -c "${script}"`, { timeout: 5_000 });

      this.logger.info(description);
      return {
        command: description,
        stdout: `Performed ${action} at (${String(x)}, ${String(y)})`,
        stderr: '',
        exitCode: 0,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Mouse action failed: ${msg}`);
      return { command: description, stdout: '', stderr: msg, exitCode: 1 };
    }
  }

  private buildMoveScript(x: number, y: number): string {
    return [
      'import Quartz',
      `point = Quartz.CGPoint(${String(x)}, ${String(y)})`,
      'event = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventMouseMoved, point, Quartz.kCGMouseButtonLeft)',
      'Quartz.CGEventPost(Quartz.kCGHIDEventTap, event)',
    ].join('; ');
  }

  private buildClickScript(x: number, y: number): string {
    return [
      'import Quartz',
      `point = Quartz.CGPoint(${String(x)}, ${String(y)})`,
      'move = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventMouseMoved, point, Quartz.kCGMouseButtonLeft)',
      'Quartz.CGEventPost(Quartz.kCGHIDEventTap, move)',
      'down = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseDown, point, Quartz.kCGMouseButtonLeft)',
      'Quartz.CGEventPost(Quartz.kCGHIDEventTap, down)',
      'up = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseUp, point, Quartz.kCGMouseButtonLeft)',
      'Quartz.CGEventPost(Quartz.kCGHIDEventTap, up)',
    ].join('; ');
  }
}
