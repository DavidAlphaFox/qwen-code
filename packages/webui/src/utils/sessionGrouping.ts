/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * 会话分组工具函数
 * 用于按日期组织会话并格式化相对时间
 */

/**
 * 会话分组结构
 * @interface SessionGroup
 * @description 表示按日期分组的会话集合
 */
export interface SessionGroup {
  /** 分组标签（如 "Today"、"Yesterday"） */
  label: string;
  /** 该分组中的会话列表 */
  sessions: Array<Record<string, unknown>>;
}

/**
 * 按日期分组会话
 * @function groupSessionsByDate
 * @description 将会话数组按日期分组到不同的时间段
 *
 * 分组类别：
 * - Today: 今天的会话
 * - Yesterday: 昨天的会话
 * - This Week: 最近7天的会话（不包括今天和昨天）
 * - Older: 超过一周的会话
 *
 * @param {Array<Record<string, unknown>>} sessions - 会话对象数组（必须包含 lastUpdated 或 startTime 字段）
 * @returns {SessionGroup[]} 分组后的会话数组，只包含非空分组
 *
 * @example
 * // 基本用法
 * const grouped = groupSessionsByDate(sessions);
 * // 结果示例：[{ label: 'Today', sessions: [...] }, { label: 'Older', sessions: [...] }]
 */
export const groupSessionsByDate = (
  sessions: Array<Record<string, unknown>>,
): SessionGroup[] => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups: {
    [key: string]: Array<Record<string, unknown>>;
  } = {
    Today: [],
    Yesterday: [],
    'This Week': [],
    Older: [],
  };

  sessions.forEach((session) => {
    const timestamp =
      (session.lastUpdated as string) || (session.startTime as string) || '';
    if (!timestamp) {
      groups['Older'].push(session);
      return;
    }

    const sessionDate = new Date(timestamp);
    const sessionDay = new Date(
      sessionDate.getFullYear(),
      sessionDate.getMonth(),
      sessionDate.getDate(),
    );

    if (sessionDay.getTime() === today.getTime()) {
      groups['Today'].push(session);
    } else if (sessionDay.getTime() === yesterday.getTime()) {
      groups['Yesterday'].push(session);
    } else if (sessionDay.getTime() > today.getTime() - 7 * 86400000) {
      groups['This Week'].push(session);
    } else {
      groups['Older'].push(session);
    }
  });

  return Object.entries(groups)
    .filter(([, sessions]) => sessions.length > 0)
    .map(([label, sessions]) => ({ label, sessions }));
};

/**
 * 格式化时间戳为相对时间字符串
 * @function getTimeAgo
 * @description 将ISO时间戳格式化为相对时间表示
 *
 * @param {string} timestamp - ISO时间戳字符串
 * @returns {string} 格式化后的相对时间（如 "now"、"5m"、"2h"、"Yesterday"、"3d" 或日期）
 *
 * @example
 * // 基本用法
 * getTimeAgo(new Date().toISOString()) // "now"
 * getTimeAgo(thirtyMinutesAgo.toISOString()) // "30m"
 * getTimeAgo(twoHoursAgo.toISOString()) // "2h"
 * getTimeAgo(yesterday.toISOString()) // "Yesterday"
 * getTimeAgo(threeDaysAgo.toISOString()) // "3d"
 */
export const getTimeAgo = (timestamp: string): string => {
  if (!timestamp) {
    return '';
  }
  const now = new Date().getTime();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return 'now';
  }
  if (diffMins < 60) {
    return `${diffMins}m`;
  }
  if (diffHours < 24) {
    return `${diffHours}h`;
  }
  if (diffDays === 1) {
    return 'Yesterday';
  }
  if (diffDays < 7) {
    return `${diffDays}d`;
  }
  return new Date(timestamp).toLocaleDateString();
};
