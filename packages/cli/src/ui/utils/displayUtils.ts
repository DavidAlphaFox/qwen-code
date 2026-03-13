/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { theme } from '../semantic-colors.js';

// --- 阈值 ---
/** 工具成功率 - 高阈值 */
export const TOOL_SUCCESS_RATE_HIGH = 95;
/** 工具成功率 - 中阈值 */
export const TOOL_SUCCESS_RATE_MEDIUM = 85;

/** 用户同意率 - 高阈值 */
export const USER_AGREEMENT_RATE_HIGH = 75;
/** 用户同意率 - 中阈值 */
export const USER_AGREEMENT_RATE_MEDIUM = 45;

/** 缓存效率 - 高阈值 */
export const CACHE_EFFICIENCY_HIGH = 40;
/** 缓存效率 - 中阈值 */
export const CACHE_EFFICIENCY_MEDIUM = 15;

// --- 颜色逻辑 ---
/**
 * 根据值和阈值获取状态颜色
 * @param value - 当前值
 * @param thresholds - 阈值配置
 * @param options - 选项配置
 * @returns 对应的颜色值
 */
export const getStatusColor = (
  value: number,
  thresholds: { green: number; yellow: number; red?: number },
  options: { defaultColor?: string } = {},
) => {
  if (value >= thresholds.green) {
    return theme.status.success;
  }
  if (value >= thresholds.yellow) {
    return theme.status.warning;
  }
  if (thresholds.red != null && value >= thresholds.red) {
    return theme.status.error;
  }
  return options.defaultColor ?? theme.status.error;
};
