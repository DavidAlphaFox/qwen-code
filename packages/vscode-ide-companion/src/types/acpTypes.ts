/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ACP 类型定义模块
 * @module
 */

import type { Usage } from '@agentclientprotocol/sdk';

import type { ApprovalModeValue } from './approvalModeValueTypes.js';

// ---------------------------------------------------------------------------
// Private / Qwen-specific types (not part of ACP spec)
// ---------------------------------------------------------------------------

/** 认证方法：Qwen OAuth */
export const authMethod = 'qwen-oauth';

/**
 * 认证更新通知（Qwen 扩展，非 ACP 规范）
 * OAuth 流程中由 agent 发送
 */
export interface AuthenticateUpdateNotification {
  /** 元数据 */
  _meta: {
    /** 认证 URI */
    authUri: string;
  };
}

/**
 * 会话更新元数据
 */
export interface SessionUpdateMeta {
  /** 使用统计 */
  usage?: Usage | null;
  /** 耗时（毫秒） */
  durationMs?: number | null;
  /** 时间戳 */
  timestamp?: number | null;
}

export {
  ApprovalMode,
  APPROVAL_MODE_MAP,
  APPROVAL_MODE_INFO,
  getApprovalModeInfoFromString,
} from './approvalModeTypes.js';

/**
 * 下一个审批模式映射
 * 定义各审批模式之间的切换关系
 */
export const NEXT_APPROVAL_MODE: {
  [k in ApprovalModeValue]: ApprovalModeValue;
} = {
  default: 'auto-edit',
  'auto-edit': 'yolo',
  plan: 'yolo',
  yolo: 'default',
};

// 询问用户问题类型

/** 问题选项 */
export interface QuestionOption {
  /** 选项标签 */
  label: string;
  /** 选项描述 */
  description: string;
}

/** 问题 */
export interface Question {
  /** 问题内容 */
  question: string;
  /** 标题 */
  header: string;
  /** 选项列表 */
  options: QuestionOption[];
  /** 是否支持多选 */
  multiSelect: boolean;
}

/**
 * 询问用户问题请求
 */
export interface AskUserQuestionRequest {
  /** 会话 ID */
  sessionId: string;
  /** 问题列表 */
  questions: Question[];
  /** 元数据 */
  metadata?: {
    /** 来源 */
    source?: string;
  };
}
