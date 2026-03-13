/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { isApiError, isStructuredError } from './quotaErrorDetection.js';

// Known rate-limit error codes across providers.
// 429  - Standard HTTP "Too Many Requests" (DashScope TPM, OpenAI, etc.)
// 503  - Provider throttling/overload (treated as rate-limit for retry UI)
// 1302 - Z.AI GLM rate limit (https://docs.z.ai/api-reference/api-code)
// 1305 - DashScope/IdealTalk internal rate limit (issue #1918)
const RATE_LIMIT_ERROR_CODES = new Set([429, 503, 1302, 1305]);

/**
 * 重试信息接口
 */
export interface RetryInfo {
  /** 由 parseAndFormatApiError 生成的可显示的错误消息 */
  message?: string;
  /** 当前重试次数（从 1 开始） */
  attempt: number;
  /** 允许的最大重试次数 */
  maxRetries: number;
  /** 重试发生前的延迟毫秒数 */
  delayMs: number;
}

/**
 * 检测速率限制/节流错误并返回重试信息
 * @param error - 要检查的错误
 * @param extraCodes - 额外的错误代码，视为速率限制错误，与内置集合合并
 */
export function isRateLimitError(
  error: unknown,
  extraCodes?: readonly number[],
): boolean {
  const code = getErrorCode(error);
  if (code === null) return false;
  if (RATE_LIMIT_ERROR_CODES.has(code)) return true;
  if (extraCodes && extraCodes.includes(code)) return true;
  return false;
}

/**
 * 从各种错误形状中提取数字错误代码
 * 镜像与 parseAndFormatApiError 相同的解析模式
 * @param error - 错误对象
 * @returns 错误代码或 null
 */
function getErrorCode(error: unknown): number | null {
  if (isApiError(error)) return Number(error.error.code) || null;

  // JSON in string / Error.message — check BEFORE isStructuredError because
  // Error instances also satisfy isStructuredError (both have .message).
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : null;
  if (msg) {
    const i = msg.indexOf('{');
    if (i !== -1) {
      try {
        const p = JSON.parse(msg.substring(i)) as unknown;
        if (isApiError(p)) return Number(p.error.code) || null;
      } catch {
        /* not valid JSON */
      }
    }
  }

  // StructuredError (.status) — plain objects from Gemini SDK
  if (isStructuredError(error)) {
    return typeof error.status === 'number' ? error.status : null;
  }

  // HttpError (.status on Error)
  if (error instanceof Error && 'status' in error) {
    const s = (error as { status?: unknown }).status;
    if (typeof s === 'number') return s;
  }

  return null;
}
