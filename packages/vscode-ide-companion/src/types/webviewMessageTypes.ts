/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Webview 消息类型定义模块
 * @module
 */

/** 权限响应载荷 */
export interface PermissionResponsePayload {
  /** 选项 ID */
  optionId: string;
}

/** 权限响应消息 */
export interface PermissionResponseMessage {
  /** 消息类型 */
  type: string;
  /** 响应数据 */
  data: PermissionResponsePayload;
}

/** 询问用户问题响应载荷 */
export interface AskUserQuestionResponsePayload {
  /** 选项 ID（如果适用） */
  optionId?: string;
  /** 用户回答的键值对 */
  answers: Record<string, string>;
  /** 是否取消 */
  cancelled?: boolean;
}

/** 询问用户问题响应消息 */
export interface AskUserQuestionResponseMessage {
  /** 消息类型 */
  type: string;
  /** 响应数据 */
  data: AskUserQuestionResponsePayload;
}
