/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';

/**
 * 应用程序范围的共享事件发射器
 * 用于 CLI 解耦部分之间的通信
 */
export const updateEventEmitter = new EventEmitter();
