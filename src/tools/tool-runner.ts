import { CommandExecutor } from '../executor/index.js';
import { ScreenshotTool } from './screenshot-tool.js';
import { MouseTool } from './mouse-tool.js';
import { KeyboardTool } from './keyboard-tool.js';
import { OpenUrlTool } from './open-url-tool.js';
import { OpenAppTool } from './open-app-tool.js';
import { WinstonLogger } from '../logger/index.js';
import type { CommandResult, ToolAction, ZetaSettings } from '../types/index.js';

export class ToolRunner {
  private readonly logger = new WinstonLogger(ToolRunner.name);
  private readonly commandExecutor = new CommandExecutor();
  private readonly screenshotTool = new ScreenshotTool();
  private readonly mouseTool = new MouseTool();
  private readonly keyboardTool = new KeyboardTool();
  private readonly openUrlTool = new OpenUrlTool();
  private readonly openAppTool = new OpenAppTool();

  async execute(
    command: string,
    tool: ToolAction | null,
    settings: ZetaSettings,
  ): Promise<CommandResult> {
    if (!tool || tool.tool === 'shell') {
      return this.commandExecutor.run(command, settings);
    }

    this.logger.info(`Running tool: ${tool.tool} with params: ${JSON.stringify(tool.params)}`);

    switch (tool.tool) {
      case 'screenshot':
        return this.screenshotTool.run(tool.params);
      case 'mouse_click':
        return this.mouseTool.run(tool.params);
      case 'keyboard_type':
        return this.keyboardTool.run(tool.params);
      case 'open_url':
        return this.openUrlTool.run(tool.params);
      case 'open_app':
        return this.openAppTool.run(tool.params);
      default:
        return {
          command: `unknown tool: ${String(tool.tool)}`,
          stdout: '',
          stderr: `Unknown tool: ${String(tool.tool)}`,
          exitCode: 1,
        };
    }
  }
}
