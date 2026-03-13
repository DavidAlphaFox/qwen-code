/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FC } from 'react';

/**
 * 消息组件属性
 * @interface MessageProps
 * @description 聊天消息组件的属性定义
 */
interface MessageProps {
  /** 消息的唯一标识符 */
  id: string;
  /** 消息的实际内容 */
  content: string;
  /** 消息发送者类型：user（用户）、system（系统）、assistant（助手） */
  sender: 'user' | 'system' | 'assistant';
  /** 消息发送时间 */
  timestamp?: Date;
  /** 自定义CSS类名 */
  className?: string;
}

/**
 * 聊天消息组件
 * @component
 * @description 用于显示聊天消息的基础组件，根据发送者类型自动调整样式
 *
 * @param {MessageProps} props - 组件属性
 * @returns {JSX.Element} React消息元素
 *
 * @example
 * // 用户消息
 * <Message id="1" content="你好" sender="user" timestamp={new Date()} />
 *
 * @example
 * // 助手消息
 * <Message id="2" content="有什么可以帮你的？" sender="assistant" />
 */
const Message: FC<MessageProps> = ({
  content,
  sender,
  timestamp,
  className = '',
}) => {
  const alignment = sender === 'user' ? 'justify-end' : 'justify-start';
  const bgColor = sender === 'user' ? 'bg-blue-500' : 'bg-gray-200';

  return (
    <div className={`flex ${alignment} mb-4 ${className}`}>
      <div
        className={`${bgColor} text-white rounded-lg px-4 py-2 max-xs md:max-w-md lg:max-w-lg`}
      >
        {content}
        {timestamp && (
          <div className="text-xs opacity-70 mt-1">
            {timestamp.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Message;
