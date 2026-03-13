/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';

/**
 * 子进程 spawn 函数的包装器
 * 用于启动子进程执行命令
 */
export const spawnWrapper = spawn;
