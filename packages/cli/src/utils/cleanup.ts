/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { Storage } from '@qwen-code/qwen-code-core';

/** 清理函数列表 */
const cleanupFunctions: Array<(() => void) | (() => Promise<void>)> = [];

/**
 * 注册清理函数
 * 在应用程序退出时会被调用
 * @param fn - 要注册的清理函数，可以是同步或异步函数
 */
export function registerCleanup(fn: (() => void) | (() => Promise<void>)) {
  cleanupFunctions.push(fn);
}

/**
 * 执行退出清理
 * 按注册顺序执行所有已注册的清理函数，并清空清理函数列表
 */
export async function runExitCleanup() {
  for (const fn of cleanupFunctions) {
    try {
      await fn();
    } catch (_) {
      // 忽略清理过程中的错误
    }
  }
  cleanupFunctions.length = 0; // 清空数组
}

/**
 * 清理检查点目录
 * 删除项目临时目录下的所有检查点文件
 */
export async function cleanupCheckpoints() {
  const storage = new Storage(process.cwd());
  const tempDir = storage.getProjectTempDir();
  const checkpointsDir = join(tempDir, 'checkpoints');
  try {
    await fs.rm(checkpointsDir, { recursive: true, force: true });
  } catch {
    // 忽略目录不存在或删除失败的情况
  }
}
