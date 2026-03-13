/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 工具调用状态
 * @typedef {'pending' | 'in_progress' | 'completed' | 'failed'} ToolCallStatus
 * @description 定义工具调用的执行状态：pending（等待中）、in_progress（执行中）、completed（已完成）、failed（失败）
 */
export type ToolCallStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

/**
 * 工具调用位置引用
 * @interface ToolCallLocation
 * @description 表示工具调用涉及的文件位置，包含文件路径和可选的行号
 */
export interface ToolCallLocation {
  /** 文件的完整路径 */
  path: string;
  /** 文件中的行号（可选） */
  line?: number | null;
}

/**
 * 工具调用内容项
 * @interface ToolCallContentItem
 * @description 表示工具调用的具体内容，可以是文本内容或代码差异
 */
export interface ToolCallContentItem {
  /** 内容类型：content（普通内容）或 diff（代码差异） */
  type: 'content' | 'diff';
  /** 文本内容相关属性 */
  content?: {
    /** 内容子类型 */
    type: string;
    /** 文本内容 */
    text?: string;
    /** 其他扩展属性 */
    [key: string]: unknown;
  };
  /** 文件路径（用于差异内容） */
  path?: string;
  /** 原始文本（用于差异对比） */
  oldText?: string | null;
  /** 新文本（用于差异对比） */
  newText?: string;
  /** 其他扩展属性 */
  [key: string]: unknown;
}

/**
 * 工具调用更新数据
 * @interface ToolCallUpdate
 * @description 表示工具调用状态的实时更新，包含工具ID、状态、内容等信息
 */
export interface ToolCallUpdate {
  /** 工具调用的唯一标识符 */
  toolCallId: string;
  /** 工具类型标识 */
  kind?: string;
  /** 工具调用标题 */
  title?: string;
  /** 工具调用状态 */
  status?: ToolCallStatus;
  /** 原始输入参数 */
  rawInput?: unknown;
  /** 工具调用返回的内容列表 */
  content?: ToolCallContentItem[];
  /** 涉及的文件位置列表 */
  locations?: ToolCallLocation[];
  /** 更新时间戳 */
  timestamp?: number;
}
