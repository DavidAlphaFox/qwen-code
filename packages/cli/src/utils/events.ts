/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';

/**
 * 应用程序事件枚举
 * 定义了应用程序中使用的各种事件类型
 */
export enum AppEvent {
  /** 打开调试控制台事件 */
  OpenDebugConsole = 'open-debug-console',
  /** 记录错误事件 */
  LogError = 'log-error',
  /** OAuth 显示消息事件 */
  OauthDisplayMessage = 'oauth-display-message',
}

/**
 * 全局应用程序事件发射器
 * 用于应用程序内部的事件通信
 */
export const appEvents = new EventEmitter();
