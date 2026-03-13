/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { runExitCleanup } from './cleanup.js';

/**
 * 用于信号表示 CLI 应该重新启动的退出代码
 */
export const RELAUNCH_EXIT_CODE = 42;

/**
 * 以特殊代码退出进程，以信号通知父进程应该重新启动它
 */
export async function relaunchApp(): Promise<void> {
  await runExitCleanup();
  process.exit(RELAUNCH_EXIT_CODE);
}
