/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SpawnOptions } from 'node:child_process';
import { spawn } from 'node:child_process';
import { createDebugLogger } from '@qwen-code/qwen-code-core';

/**
 * 常用的 Windows 控制台代码页 (CP)，用于编码转换
 * - `UTF8` (65001): Unicode (UTF-8) — 推荐用于跨语言脚本
 * - `GBK` (936): 简体中文 — 大多数中文 Windows 系统的默认设置
 * - `BIG5` (950): 繁体中文
 * - `LATIN1` (1252): 西欧 — 许多西方系统的默认设置
 */
export const CodePage = {
  UTF8: 65001,
  GBK: 936,
  BIG5: 950,
  LATIN1: 1252,
} as const;

export type CodePage = (typeof CodePage)[keyof typeof CodePage];

/**
 * 检查查询字符串是否可能表示 '@' 命令
 * 如果查询以 '@' 开头或包含 '@'（前面有空格，后面跟非空白字符），则触发
 * @param query - 输入查询字符串
 * @returns 如果查询看起来像 '@' 命令则返回 true，否则返回 false
 */
export const isAtCommand = (query: string): boolean =>
  // Check if starts with @ OR has a space, then @
  query.startsWith('@') || /\s@/.test(query);

/**
 * 检查查询字符串是否可能表示 '/' 命令
 * 如果查询以 '/' 开头但排除像 '//' 和 '/*' 这样的代码注释
 * @param query - 输入查询字符串
 * @returns 如果查询看起来像 '/' 命令则返回 true，否则返回 false
 */
export const isSlashCommand = (query: string): boolean => {
  if (!query.startsWith('/')) {
    return false;
  }

  // Exclude line comments that start with '//'
  if (query.startsWith('//')) {
    return false;
  }

  // Exclude block comments that start with '/*'
  if (query.startsWith('/*')) {
    return false;
  }

  return true;
};

const debugLogger = createDebugLogger('COMMAND_UTILS');

// Copies a string snippet to the clipboard for different platforms
export const copyToClipboard = async (text: string): Promise<void> => {
  const run = (cmd: string, args: string[], options?: SpawnOptions) =>
    new Promise<void>((resolve, reject) => {
      const child = options ? spawn(cmd, args, options) : spawn(cmd, args);
      let stderr = '';
      if (child.stderr) {
        child.stderr.on('data', (chunk) => (stderr += chunk.toString()));
      }
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) return resolve();
        const errorMsg = stderr.trim();
        reject(
          new Error(
            `'${cmd}' exited with code ${code}${errorMsg ? `: ${errorMsg}` : ''}`,
          ),
        );
      });
      if (child.stdin) {
        child.stdin.on('error', reject);
        child.stdin.write(text);
        child.stdin.end();
      } else {
        reject(new Error('Child process has no stdin stream to write to.'));
      }
    });

  // Configure stdio for Linux clipboard commands.
  // - stdin: 'pipe' to write the text that needs to be copied.
  // - stdout: 'inherit' since we don't need to capture the command's output on success.
  // - stderr: 'pipe' to capture error messages (e.g., "command not found") for better error handling.
  const linuxOptions: SpawnOptions = { stdio: ['pipe', 'inherit', 'pipe'] };

  switch (process.platform) {
    case 'win32':
      return run('cmd', ['/c', `chcp ${CodePage.UTF8} >nul && clip`]);
    case 'darwin':
      return run('pbcopy', []);
    case 'linux':
      try {
        await run('xclip', ['-selection', 'clipboard'], linuxOptions);
      } catch (primaryError) {
        try {
          // If xclip fails for any reason, try xsel as a fallback.
          await run('xsel', ['--clipboard', '--input'], linuxOptions);
        } catch (fallbackError) {
          const xclipNotFound =
            primaryError instanceof Error &&
            (primaryError as NodeJS.ErrnoException).code === 'ENOENT';
          const xselNotFound =
            fallbackError instanceof Error &&
            (fallbackError as NodeJS.ErrnoException).code === 'ENOENT';
          if (xclipNotFound && xselNotFound) {
            throw new Error(
              'Please ensure xclip or xsel is installed and configured.',
            );
          }

          let primaryMsg =
            primaryError instanceof Error
              ? primaryError.message
              : String(primaryError);
          if (xclipNotFound) {
            primaryMsg = `xclip not found`;
          }
          let fallbackMsg =
            fallbackError instanceof Error
              ? fallbackError.message
              : String(fallbackError);
          if (xselNotFound) {
            fallbackMsg = `xsel not found`;
          }

          throw new Error(
            `All copy commands failed. "${primaryMsg}", "${fallbackMsg}". `,
          );
        }
      }
      return;
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
};

export const getUrlOpenCommand = (): string => {
  // --- Determine the OS-specific command to open URLs ---
  let openCmd: string;
  switch (process.platform) {
    case 'darwin':
      openCmd = 'open';
      break;
    case 'win32':
      openCmd = 'start';
      break;
    case 'linux':
      openCmd = 'xdg-open';
      break;
    default:
      // Default to xdg-open, which appears to be supported for the less popular operating systems.
      openCmd = 'xdg-open';
      debugLogger.warn(
        `Unknown platform: ${process.platform}. Attempting to open URLs with: ${openCmd}.`,
      );
      break;
  }
  return openCmd;
};
