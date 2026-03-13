/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import util from 'node:util';
import { Storage } from '../config/storage.js';
import { updateSymlink } from './symlink.js';

/**
 * 日志级别类型
 */
type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

/**
 * 调试日志会话接口
 */
export interface DebugLogSession {
  /** 获取会话 ID */
  getSessionId: () => string;
}

/**
 * 调试日志记录器接口
 */
export interface DebugLogger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

let ensureDebugDirPromise: Promise<void> | null = null;
let hasWriteFailure = false;
let globalSession: DebugLogSession | null = null;
const sessionContext = new AsyncLocalStorage<DebugLogSession>();

function isDebugLogFileEnabled(): boolean {
  const value = process.env['QWEN_DEBUG_LOG_FILE'];
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return !['0', 'false', 'off', 'no'].includes(normalized);
}

function getActiveSession(): DebugLogSession | null {
  return sessionContext.getStore() ?? globalSession;
}

function ensureDebugDirExists(): Promise<void> {
  if (!ensureDebugDirPromise) {
    ensureDebugDirPromise = fs
      .mkdir(Storage.getGlobalDebugDir(), { recursive: true })
      .then(() => undefined)
      .catch(() => {
        hasWriteFailure = true;
        ensureDebugDirPromise = null;
      });
  }
  return ensureDebugDirPromise ?? Promise.resolve();
}

function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (arg instanceof Error) {
        return arg.stack ?? `${arg.name}: ${arg.message}`;
      }
      return arg;
    })
    .map((arg) => (typeof arg === 'string' ? arg : util.inspect(arg)))
    .join(' ');
}

/**
 * 构建日志行，格式为：
 * `2026-01-23T06:58:02.011Z [DEBUG] [TAG] message`
 *
 * 标签是可选的。如果未提供，格式为：
 * `2026-01-23T06:58:02.011Z [DEBUG] message`
 * @param level - 日志级别
 * @param message - 日志消息
 * @param tag - 可选标签
 * @returns 格式化的日志行
 */
function buildLogLine(level: LogLevel, message: string, tag?: string): string {
  const timestamp = new Date().toISOString();
  const tagPart = tag ? ` [${tag}]` : '';
  return `${timestamp} [${level}]${tagPart} ${message}\n`;
}

function writeLog(
  session: DebugLogSession,
  level: LogLevel,
  tag: string | undefined,
  args: unknown[],
): void {
  if (!isDebugLogFileEnabled()) {
    return;
  }

  const sessionId = session.getSessionId();
  const logFilePath = Storage.getDebugLogPath(sessionId);
  const message = formatArgs(args);
  const line = buildLogLine(level, message, tag);

  void ensureDebugDirExists()
    .then(() => fs.appendFile(logFilePath, line, 'utf8'))
    .catch(() => {
      hasWriteFailure = true;
    });
}

/**
 * 返回是否有任何调试日志写入失败
 * 用于 UI 在启动时显示降级模式通知
 * @returns 是否有写入失败
 */
export function isDebugLoggingDegraded(): boolean {
  return hasWriteFailure;
}

/**
 * 重置写入失败跟踪状态
 * 主要用于测试
 */
export function resetDebugLoggingState(): void {
  hasWriteFailure = false;
  ensureDebugDirPromise = null;
}

const DEBUG_LATEST_ALIAS = 'latest';

function updateLatestDebugLogAlias(sessionId: string): void {
  if (!isDebugLogFileEnabled()) {
    return;
  }

  const aliasPath = path.join(Storage.getGlobalDebugDir(), DEBUG_LATEST_ALIAS);
  const targetPath = Storage.getDebugLogPath(sessionId);

  void ensureDebugDirExists()
    .then(() => updateSymlink(aliasPath, targetPath, { fallbackCopy: false }))
    .catch(() => {
      // Best-effort; don't degrade overall logging
    });
}

/**
 * 设置 createDebugLogger() 使用的进程级调试日志会话
 *
 * 这是当没有通过 runWithDebugLogSession() 绑定异步本地会话时使用的默认会话
 * @param session - 调试日志会话或 null
 */
export function setDebugLogSession(
  session: DebugLogSession | null | undefined,
) {
  globalSession = session ?? null;
  if (session) {
    updateLatestDebugLogAlias(session.getSessionId());
  }
}

/**
 * 使用绑定到当前异步上下文的会话运行函数
 *
 * 这是可选的；createDebugLogger() 会回退到通过 setDebugLogSession() 设置的进程级会话
 * @param session - 调试日志会话
 * @param fn - 要运行的函数
 * @returns 函数的结果
 */
export function runWithDebugLogSession<T>(
  session: DebugLogSession,
  fn: () => T,
): T {
  return sessionContext.run(session, fn);
}

/**
 * 创建写入当前调试日志会话的调试日志记录器
 *
 * 会话解析顺序：
 * 1) 异步本地会话 (runWithDebugLogSession)
 * 2) 进程级会话 (setDebugLogSession)
 * @param tag - 可选标签
 * @returns 调试日志记录器
 */
export function createDebugLogger(tag?: string): DebugLogger {
  return {
    debug: (...args: unknown[]) => {
      const session = getActiveSession();
      if (!session) return;
      writeLog(session, 'DEBUG', tag, args);
    },
    info: (...args: unknown[]) => {
      const session = getActiveSession();
      if (!session) return;
      writeLog(session, 'INFO', tag, args);
    },
    warn: (...args: unknown[]) => {
      const session = getActiveSession();
      if (!session) return;
      writeLog(session, 'WARN', tag, args);
    },
    error: (...args: unknown[]) => {
      const session = getActiveSession();
      if (!session) return;
      writeLog(session, 'ERROR', tag, args);
    },
  };
}
