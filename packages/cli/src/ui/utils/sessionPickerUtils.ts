/**
 * @license
 * Copyright 2025 Qwen Code
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SessionListItem } from '@qwen-code/qwen-code-core';

/**
 * 会话选择器中用于管理已加载会话的状态
 */
export interface SessionState {
  sessions: SessionListItem[];
  hasMore: boolean;
  nextCursor?: number;
}

/**
 * 加载会话的页面大小
 */
export const SESSION_PAGE_SIZE = 20;

/**
 * 截断文本以适应给定宽度，必要时添加省略号
 * @param text - 要截断的文本
 * @param maxWidth - 最大宽度
 * @returns 截断后的文本
 */
export function truncateText(text: string, maxWidth: number): string {
  const firstLine = text.split(/\r?\n/, 1)[0];
  if (firstLine.length <= maxWidth) {
    return firstLine;
  }
  if (maxWidth <= 3) {
    return firstLine.slice(0, maxWidth);
  }
  return firstLine.slice(0, maxWidth - 3) + '...';
}

/**
 * 可选地按分支过滤会话
 * @param sessions - 会话列表
 * @param filterByBranch - 是否按分支过滤
 * @param currentBranch - 当前分支
 * @returns 过滤后的会话列表
 */
export function filterSessions(
  sessions: SessionListItem[],
  filterByBranch: boolean,
  currentBranch?: string,
): SessionListItem[] {
  return sessions.filter((session) => {
    // Apply branch filter if enabled
    if (filterByBranch && currentBranch) {
      return session.gitBranch === currentBranch;
    }
    return true;
  });
}

/**
 * 格式化消息数量显示，带有正确的复数形式
 * @param count - 消息数量
 * @returns 格式化的字符串
 */
export function formatMessageCount(count: number): string {
  return count === 1 ? '1 message' : `${count} messages`;
}
