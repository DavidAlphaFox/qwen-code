/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 消息组件属性
 * @interface MessageProps
 * @description 定义聊天消息的显示属性，包含消息ID、内容、发送者等信息
 */
export interface MessageProps {
  /** 消息的唯一标识符 */
  id: string;
  /** 消息的实际文本内容 */
  content: string;
  /** 消息发送者类型：user（用户）、system（系统）、assistant（助手） */
  sender: 'user' | 'system' | 'assistant';
  /** 消息发送时间，可选 */
  timestamp?: Date;
  /** 自定义CSS类名，用于额外样式 */
  className?: string;
}
