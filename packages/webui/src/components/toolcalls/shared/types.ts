/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * 工具调用组件共享类型定义
 */

/**
 * 工具调用内容类型
 * @interface ToolCallContent
 * @description 表示工具调用的内容，可以是普通文本内容或代码差异
 */
export interface ToolCallContent {
  /** 内容类型：content（普通内容）或 diff（代码差异） */
  type: 'content' | 'diff';
  // For content type
  /** 文本内容相关属性 */
  content?: {
    /** 内容类型标识 */
    type: string;
    /** 文本内容 */
    text?: string;
    /** 错误信息 */
    error?: unknown;
    /** 其他扩展属性 */
    [key: string]: unknown;
  };
  // For diff type
  /** 文件路径（用于差异内容） */
  path?: string;
  /** 原始文本（用于差异对比） */
  oldText?: string | null;
  /** 新文本（用于差异对比） */
  newText?: string;
}

/**
 * 工具调用位置类型
 * @interface ToolCallLocation
 * @description 表示工具调用涉及的文件位置
 */
export interface ToolCallLocation {
  /** 文件的完整路径 */
  path: string;
  /** 文件中的行号（可选） */
  line?: number | null;
}

/**
 * 工具调用状态类型
 * @typedef {'pending' | 'in_progress' | 'completed' | 'failed'} ToolCallStatus
 * @description 定义工具调用的执行状态：pending（等待中）、in_progress（执行中）、completed（已完成）、failed（失败）
 */
export type ToolCallStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

/**
 * 基础工具调用数据接口
 * @interface ToolCallData
 * @description 表示工具调用的完整数据
 */
export interface ToolCallData {
  /** 工具调用的唯一标识符 */
  toolCallId: string;
  /** 工具类型标识 */
  kind: string;
  /** 工具调用标题（字符串或对象） */
  title: string | object;
  /** 工具调用状态 */
  status: ToolCallStatus;
  /** 原始输入参数（字符串或对象） */
  rawInput?: string | object;
  /** 工具调用返回的内容列表 */
  content?: ToolCallContent[];
  /** 涉及的文件位置列表 */
  locations?: ToolCallLocation[];
  /** 更新时间戳 */
  timestamp?: number;
}

/**
 * 所有工具调用组件的基础属性
 * @interface BaseToolCallProps
 * @description 工具调用组件的公共属性
 */
export interface BaseToolCallProps {
  /** 工具调用数据 */
  toolCall: ToolCallData;
  // Optional timeline flags for rendering connector line cropping
  /** 是否是第一个（用于时间线连接线裁剪） */
  isFirst?: boolean;
  /** 是否是最后一个（用于时间线连接线裁剪） */
  isLast?: boolean;
}

/**
 * 分组内容结构
 * @interface GroupedContent
 * @description 用于渲染的分内容组结构
 */
export interface GroupedContent {
  /** 文本输出列表 */
  textOutputs: string[];
  /** 错误信息列表 */
  errors: string[];
  /** 代码差异列表 */
  diffs: ToolCallContent[];
  /** 其他数据列表 */
  otherData: unknown[];
}

/**
 * 容器状态类型
 * @typedef {'success' | 'error' | 'warning' | 'loading' | 'default'} ContainerStatus
 * @description 用于样式渲染的容器状态：success（成功）、error（错误）、warning（警告）、loading（加载中）、default（默认）
 */
export type ContainerStatus =
  | 'success'
  | 'error'
  | 'warning'
  | 'loading'
  | 'default';

/**
 * 计划条目状态类型
 * @typedef {'pending' | 'in_progress' | 'completed'} PlanEntryStatus
 * @description 定义计划条目的状态：pending（待处理）、in_progress（进行中）、completed（已完成）
 */
export type PlanEntryStatus = 'pending' | 'in_progress' | 'completed';

/**
 * 计划条目接口
 * @interface PlanEntry
 * @description 表示计划中的单个任务条目，用于 UpdatedPlanToolCall
 */
export interface PlanEntry {
  /** 计划项的内容描述 */
  content: string;
  /** 计划项的状态 */
  status: PlanEntryStatus;
}
