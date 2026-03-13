/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type SlashCommand } from '../ui/commands/types.js';

/**
 * 解析后的斜杠命令结构
 */
export type ParsedSlashCommand = {
  /** 要执行的命令 */
  commandToExecute: SlashCommand | undefined;
  /** 命令参数 */
  args: string;
  /** 命令的规范路径 */
  canonicalPath: string[];
};

/**
 * 将原始斜杠命令字符串解析为命令、参数和规范路径
 * 如果未找到有效命令，commandToExecute 属性将为 undefined
 * @param query - 原始输入字符串，例如 "/memory add some data" 或 "/help"
 * @param commands - 可用的顶级斜杠命令列表
 * @returns ParsedSlashCommand 包含解析后的命令、参数及其规范路径的对象
 */
export const parseSlashCommand = (
  query: string,
  commands: readonly SlashCommand[],
): ParsedSlashCommand => {
  const trimmed = query.trim();

  const parts = trimmed.substring(1).trim().split(/\s+/);
  const commandPath = parts.filter((p) => p); // 命令的部分，例如 ['memory', 'add']

  let currentCommands = commands;
  let commandToExecute: SlashCommand | undefined;
  let pathIndex = 0;
  const canonicalPath: string[] = [];

  for (const part of commandPath) {
    // TODO: 为提高性能和架构清晰度，这种两遍搜索可以被替换
    // 更优化的方法是在 CommandService.ts 中预先计算一个单一的查找映射
    // 在初始加载阶段解析所有名称和别名冲突
    // 然后处理器将对该映射执行单一快速查找

    // 第一遍：检查主命令名称的精确匹配
    let foundCommand = currentCommands.find((cmd) => cmd.name === part);

    // 第二遍：如果主名称不匹配，则检查别名
    if (!foundCommand) {
      foundCommand = currentCommands.find((cmd) =>
        cmd.altNames?.includes(part),
      );
    }

    if (foundCommand) {
      commandToExecute = foundCommand;
      canonicalPath.push(foundCommand.name);
      pathIndex++;
      if (foundCommand.subCommands) {
        currentCommands = foundCommand.subCommands;
      } else {
        break;
      }
    } else {
      break;
    }
  }

  const args = parts.slice(pathIndex).join(' ');

  return { commandToExecute, args, canonicalPath };
};
