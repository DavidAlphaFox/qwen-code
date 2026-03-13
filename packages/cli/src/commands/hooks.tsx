/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { enableCommand } from './hooks/enable.js';
import { disableCommand } from './hooks/disable.js';

/**
 * Hooks 命令模块
 * 用于管理 Qwen Code 钩子的 yargs 命令定义
 */
export const hooksCommand: CommandModule = {
  command: 'hooks <command>',
  aliases: ['hook'],
  describe: '管理 Qwen Code 钩子',
  builder: (yargs) =>
    yargs
      .command(enableCommand)
      .command(disableCommand)
      .demandCommand(1, 'You need at least one command before continuing.')
      .version(false),
  handler: () => {
    // This handler is not called when a subcommand is provided.
    // Yargs will show the help menu.
  },
};
