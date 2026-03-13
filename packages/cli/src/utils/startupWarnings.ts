/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import { join as pathJoin } from 'node:path';
import { getErrorMessage } from '@qwen-code/qwen-code-core';

/** 临时警告文件路径 */
const warningsFilePath = pathJoin(os.tmpdir(), 'qwen-code-warnings.txt');

/**
 * 获取启动警告信息
 * 从临时文件中读取警告信息，读取后删除该文件
 * @returns Promise<string[]> 警告字符串数组，如果没有警告则返回空数组
 */
export async function getStartupWarnings(): Promise<string[]> {
  try {
    await fs.access(warningsFilePath); // 检查文件是否存在
    const warningsContent = await fs.readFile(warningsFilePath, 'utf-8');
    const warnings = warningsContent
      .split('\n')
      .filter((line) => line.trim() !== '');
    try {
      await fs.unlink(warningsFilePath);
    } catch {
      warnings.push('Warning: Could not delete temporary warnings file.');
    }
    return warnings;
  } catch (err: unknown) {
    // 如果 fs.access 抛出异常，说明文件不存在或不可访问
    // 在获取警告的上下文中这不是错误，所以返回空数组
    // 仅当不是"文件未找到"类型的错误时才返回错误消息
    // 原始逻辑对任何 fs.existsSync 失败返回错误消息
    // 为了保持更紧密的一致性同时使其异步，我们将检查错误代码
    // ENOENT 是 "Error NO ENTry"（文件未找到）
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      return []; // 文件未找到，没有警告要返回
    }
    // 对于其他错误（权限等），返回错误消息
    return [`Error checking/reading warnings file: ${getErrorMessage(err)}`];
  }
}
