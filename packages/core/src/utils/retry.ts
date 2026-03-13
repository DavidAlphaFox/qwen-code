/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GenerateContentResponse } from '@google/genai';
import { AuthType } from '../core/contentGenerator.js';
import { isQwenQuotaExceededError } from './quotaErrorDetection.js';
import { createDebugLogger } from './debugLogger.js';

const debugLogger = createDebugLogger('RETRY');

/**
 * HTTP 错误接口
 */
export interface HttpError extends Error {
  status?: number;
}

/**
 * 重试选项配置
 */
export interface RetryOptions {
  /** 最大重试次数 */
  maxAttempts: number;
  /** 初始延迟毫秒数 */
  initialDelayMs: number;
  /** 最大延迟毫秒数 */
  maxDelayMs: number;
  /** 判断错误是否应该重试的函数 */
  shouldRetryOnError: (error: Error) => boolean;
  /** 判断内容是否应该重试的函数（可选） */
  shouldRetryOnContent?: (content: GenerateContentResponse) => boolean;
  /** 认证类型 */
  authType?: string;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 7,
  initialDelayMs: 1500,
  maxDelayMs: 30000, // 30 秒
  shouldRetryOnError: defaultShouldRetry,
};

/**
 * 默认的重试判断函数
 * 对 429（请求过多）和 5xx 服务器错误进行重试
 * @param error - 错误对象
 * @returns 如果是临时错误返回 true，否则返回 false
 */
function defaultShouldRetry(error: Error | unknown): boolean {
  const status = getErrorStatus(error);
  return (
    status === 429 || (status !== undefined && status >= 500 && status < 600)
  );
}

/**
 * 延迟执行指定的毫秒数
 * @param ms - 延迟的毫秒数
 * @returns 延迟后解析的 Promise
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 使用指数退避和抖动重试函数
 * @param fn - 要重试的异步函数
 * @param options - 可选的重试配置
 * @returns 成功时返回函数结果的 Promise
 * @throws 如果所有尝试都失败，则抛出最后一个遇到的错误
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options?: Partial<RetryOptions>,
): Promise<T> {
  if (options?.maxAttempts !== undefined && options.maxAttempts <= 0) {
    throw new Error('maxAttempts must be a positive number.');
  }

  const cleanOptions = options
    ? Object.fromEntries(Object.entries(options).filter(([_, v]) => v != null))
    : {};

  const {
    maxAttempts,
    initialDelayMs,
    maxDelayMs,
    authType,
    shouldRetryOnError,
    shouldRetryOnContent,
  } = {
    ...DEFAULT_RETRY_OPTIONS,
    ...cleanOptions,
  };

  let attempt = 0;
  let currentDelay = initialDelayMs;

  while (attempt < maxAttempts) {
    attempt++;
    try {
      const result = await fn();

      if (
        shouldRetryOnContent &&
        shouldRetryOnContent(result as GenerateContentResponse)
      ) {
        const jitter = currentDelay * 0.3 * (Math.random() * 2 - 1);
        const delayWithJitter = Math.max(0, currentDelay + jitter);
        await delay(delayWithJitter);
        currentDelay = Math.min(maxDelayMs, currentDelay * 2);
        continue;
      }

      return result;
    } catch (error) {
      const errorStatus = getErrorStatus(error);

      // Check for Qwen OAuth quota exceeded error - throw immediately without retry
      if (authType === AuthType.QWEN_OAUTH && isQwenQuotaExceededError(error)) {
        throw new Error(
          `Qwen OAuth quota exceeded: Your free daily quota has been reached.\n\n` +
            `To continue using Qwen Code without waiting, upgrade to the Alibaba Cloud Coding Plan:\n` +
            `  China:       https://help.aliyun.com/zh/model-studio/coding-plan\n` +
            `  Global/Intl: https://www.alibabacloud.com/help/en/model-studio/coding-plan\n\n` +
            `After subscribing, run /auth to configure your Coding Plan API key.`,
        );
      }

      // Check if we've exhausted retries or shouldn't retry
      if (attempt >= maxAttempts || !shouldRetryOnError(error as Error)) {
        throw error;
      }

      const retryAfterMs =
        errorStatus === 429 ? getRetryAfterDelayMs(error) : 0;

      if (retryAfterMs > 0) {
        // Respect Retry-After header if present and parsed
        debugLogger.warn(
          `Attempt ${attempt} failed with status ${errorStatus ?? 'unknown'}. Retrying after explicit delay of ${retryAfterMs}ms...`,
          error,
        );
        await delay(retryAfterMs);
        // Reset currentDelay for next potential non-429 error, or if Retry-After is not present next time
        currentDelay = initialDelayMs;
      } else {
        // Fallback to exponential backoff with jitter
        logRetryAttempt(attempt, error, errorStatus);
        // Add jitter: +/- 30% of currentDelay
        const jitter = currentDelay * 0.3 * (Math.random() * 2 - 1);
        const delayWithJitter = Math.max(0, currentDelay + jitter);
        await delay(delayWithJitter);
        currentDelay = Math.min(maxDelayMs, currentDelay * 2);
      }
    }
  }
  // This line should theoretically be unreachable due to the throw in the catch block.
  // Added for type safety and to satisfy the compiler that a promise is always returned.
  throw new Error('Retry attempts exhausted');
}

/**
 * 从错误对象中提取 HTTP 状态码
 * 按优先级检查以下属性：
 * 1. error.status - OpenAI、Anthropic、 Gemini SDK 错误
 * 2. error.statusCode - 某些 HTTP 客户端库
 * 3. error.response.status - Axios 风格的错误
 * 4. error.error.code - 嵌套错误对象
 * @param error - 错误对象
 * @returns HTTP 状态码（100-599），如果未找到则返回 undefined
 */
export function getErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  const err = error as {
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown };
    error?: { code?: unknown };
  };

  const value =
    err.status ?? err.statusCode ?? err.response?.status ?? err.error?.code;

  return typeof value === 'number' && value >= 100 && value <= 599
    ? value
    : undefined;
}

/**
 * 从错误对象的响应头中提取 Retry-After 延迟时间
 * @param error - 错误对象
 * @returns 延迟毫秒数，如果未找到或无效则返回 0
 */
function getRetryAfterDelayMs(error: unknown): number {
  if (typeof error === 'object' && error !== null) {
    // Check for error.response.headers (common in axios errors)
    if (
      'response' in error &&
      typeof (error as { response?: unknown }).response === 'object' &&
      (error as { response?: unknown }).response !== null
    ) {
      const response = (error as { response: { headers?: unknown } }).response;
      if (
        'headers' in response &&
        typeof response.headers === 'object' &&
        response.headers !== null
      ) {
        const headers = response.headers as { 'retry-after'?: unknown };
        const retryAfterHeader = headers['retry-after'];
        if (typeof retryAfterHeader === 'string') {
          const retryAfterSeconds = parseInt(retryAfterHeader, 10);
          if (!isNaN(retryAfterSeconds)) {
            return retryAfterSeconds * 1000;
          }
          // It might be an HTTP date
          const retryAfterDate = new Date(retryAfterHeader);
          if (!isNaN(retryAfterDate.getTime())) {
            return Math.max(0, retryAfterDate.getTime() - Date.now());
          }
        }
      }
    }
  }
  return 0;
}

/**
 * 使用指数退避重试时记录重试尝试的消息
 * @param attempt - 当前尝试次数
 * @param error - 导致重试的错误
 * @param errorStatus - 错误的 HTTP 状态码（如果有）
 */
function logRetryAttempt(
  attempt: number,
  error: unknown,
  errorStatus?: number,
): void {
  const message = errorStatus
    ? `Attempt ${attempt} failed with status ${errorStatus}. Retrying with backoff...`
    : `Attempt ${attempt} failed. Retrying with backoff...`;

  if (errorStatus === 429) {
    debugLogger.warn(message, error);
  } else if (errorStatus && errorStatus >= 500 && errorStatus < 600) {
    debugLogger.error(message, error);
  } else {
    debugLogger.warn(message, error);
  }
}
