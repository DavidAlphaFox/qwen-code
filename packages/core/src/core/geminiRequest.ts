/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type PartListUnion } from '@google/genai';
import { partToString } from '../utils/partUtils.js';

/**
 * 表示要发送到 Gemini API 的请求
 * 目前，它是 PartListUnion 的别名作为主要内容
 * 以后可以扩展以包含其他请求参数
 */
export type GeminiCodeRequest = PartListUnion;

/**
 * 将 PartListUnion 转换为字符串
 * @param value - PartListUnion 值
 * @returns 字符串表示
 */
export function partListUnionToString(value: PartListUnion): string {
  return partToString(value, { verbose: true });
}
