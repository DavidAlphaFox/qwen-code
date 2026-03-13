/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 审批模式值类型
 * 用于 ACP 协议中控制 agent 行为
 * - plan: 计划模式，只生成计划不执行
 * - default: 默认模式，需要用户确认
 * - auto-edit: 自动编辑模式，自动应用更改
 * - yolo: 完全自动模式，无需任何确认
 */
export type ApprovalModeValue = 'plan' | 'default' | 'auto-edit' | 'yolo';
