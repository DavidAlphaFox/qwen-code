/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 聊天消息角色类型
 * @typedef {'user' | 'assistant' | 'system'} MessageRole
 * @description 定义聊天中消息发送者的角色：用户、助手或系统
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * 基础聊天消息结构
 * @interface ChatMessage
 * @description 表示聊天中的单条消息，包含角色、内容和时间戳
 */
export interface ChatMessage {
  /** 消息发送者的角色 */
  role: MessageRole;
  /** 消息的实际内容 */
  content: string;
  /** 消息发送的时间戳（Unix时间戳，毫秒） */
  timestamp: number;
}

/**
 * 任务计划条目
 * @interface PlanEntry
 * @description 用于跟踪任务进度的计划项，包含内容、优先级和状态
 */
export interface PlanEntry {
  /** 计划项的具体内容描述 */
  content: string;
  /** 任务优先级，可选值：high（高）、medium（中）、low（低） */
  priority?: 'high' | 'medium' | 'low';
  /** 任务当前状态：pending（待处理）、in_progress（进行中）、completed（已完成） */
  status: 'pending' | 'in_progress' | 'completed';
}
