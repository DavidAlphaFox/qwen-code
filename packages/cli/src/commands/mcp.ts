/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 'mcp' 命令文件
/**
 * MCP 命令模块
 * 用于管理 MCP 服务器的 yargs 命令定义
 */
export const mcpCommand: CommandModule = {
  command: 'mcp',
  describe: '管理 MCP 服务器',
  builder: (yargs: Argv) =>
    yargs
      .command(addCommand)
      .command(removeCommand)
      .command(listCommand)
      .demandCommand(1, 'You need at least one command before continuing.')
      .version(false),
  handler: () => {
    // yargs will automatically show help if no subcommand is provided
    // thanks to demandCommand(1) in the builder.
  },
};
