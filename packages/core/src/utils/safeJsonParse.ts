/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsonrepair } from 'jsonrepair';
import { createDebugLogger } from './debugLogger.js';

const debugLogger = createDebugLogger('JSON_PARSE');

/**
 * 使用 jsonrepair 后备选项安全解析 JSON 字符串
 * 此函数首先尝试正常解析 JSON，如果失败，
 * 使用 jsonrepair 修复常见的 JSON 格式问题后再解析
 * @param jsonString - 要解析的 JSON 字符串
 * @param fallbackValue - 如果解析完全失败则返回的值
 * @returns 解析后的对象或后备值
 */
export function safeJsonParse<T = Record<string, unknown>>(
  jsonString: string,
  fallbackValue: T = {} as T,
): T {
  if (!jsonString || typeof jsonString !== 'string') {
    return fallbackValue;
  }

  try {
    // First attempt: try normal JSON.parse
    return JSON.parse(jsonString) as T;
  } catch (error) {
    try {
      // Second attempt: use jsonrepair to fix common JSON issues
      const repairedJson = jsonrepair(jsonString);

      // jsonrepair always returns a string, so we need to parse it
      return JSON.parse(repairedJson) as T;
    } catch (repairError) {
      debugLogger.error('Failed to parse JSON even with jsonrepair:', {
        originalError: error,
        repairError,
        jsonString,
      });
      return fallbackValue;
    }
  }
}
