/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CLI 命令中用于写入 stdout/stderr 的工具函数
 * 这些辅助函数用于独立 CLI 命令（如 `qwen extensions list`）中，
 * 而不是使用 console.log/console.error，因为输出是面向用户的结果，不是调试日志
 * 对于调试/诊断日志，请使用 @qwen-code/qwen-code-core 中的 createDebugLogger()
 */

/**
 * 向 stdout 写入消息并换行
 * 用于用户期望看到的正常命令输出
 * 如果消息已经以换行符结尾，则避免重复换行
 * @param message - 要写入的消息
 */
export const writeStdoutLine = (message: string): void => {
  process.stdout.write(message.endsWith('\n') ? message : `${message}\n`);
};

/**
 * 向 stderr 写入消息并换行
 * 用于 CLI 命令中的错误消息
 * 如果消息已经以换行符结尾，则避免重复换行
 * @param message - 要写入的错误消息
 */
export const writeStderrLine = (message: string): void => {
  process.stderr.write(message.endsWith('\n') ? message : `${message}\n`);
};

/**
 * 清除终端屏幕
 * 用于替代 console.clear() 以满足 no-console  lint 规则
 */
export const clearScreen = (): void => {
  console.clear();
};
