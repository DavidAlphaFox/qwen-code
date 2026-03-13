/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 连接类型定义模块
 * @module
 */

import type { ChildProcess } from 'child_process';
import type {
  RequestPermissionRequest,
  SessionNotification,
} from '@agentclientprotocol/sdk';
import type {
  AuthenticateUpdateNotification,
  AskUserQuestionRequest,
} from './acpTypes.js';

/**
 * 待处理请求
 * 表示一个等待响应的 RPC 请求
 */
export interface PendingRequest<T = unknown> {
  /** Promise resolve 函数 */
  resolve: (value: T) => void;
  /** Promise reject 函数 */
  reject: (error: Error) => void;
  /** 超时定时器 ID */
  timeoutId?: NodeJS.Timeout;
  /** 方法名 */
  method: string;
}

/**
 * ACP 连接回调接口
 * 定义与 ACP 连接交互的各种回调函数
 */
export interface AcpConnectionCallbacks {
  /** 会话更新回调 */
  onSessionUpdate: (data: SessionNotification) => void;
  /** 权限请求回调 */
  onPermissionRequest: (data: RequestPermissionRequest) => Promise<{
    optionId: string;
  }>;
  /** 认证更新回调 */
  onAuthenticateUpdate: (data: AuthenticateUpdateNotification) => void;
  /** 结束轮次回调 */
  onEndTurn: (reason?: string) => void;
  /** 询问用户问题回调 */
  onAskUserQuestion: (data: AskUserQuestionRequest) => Promise<{
    optionId: string;
    answers?: Record<string, string>;
  }>;
}

/**
 * ACP 连接状态
 * 表示 ACP 连接的当前状态
 */
export interface AcpConnectionState {
  /** 子进程 */
  child: ChildProcess | null;
  /** 待处理请求映射 */
  pendingRequests: Map<number, PendingRequest<unknown>>;
  /** 下一个请求 ID */
  nextRequestId: number;
  /** 当前会话 ID */
  sessionId: string | null;
  /** 是否已初始化 */
  isInitialized: boolean;
}
