/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 线性插值
 * @param start - 起始值
 * @param end - 结束值
 * @param t - 插值量（通常在 0 和 1 之间）
 * @returns number 插值结果
 */
export const lerp = (start: number, end: number, t: number): number =>
  start + (end - start) * t;
