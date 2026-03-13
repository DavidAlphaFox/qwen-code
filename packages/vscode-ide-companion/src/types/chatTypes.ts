/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 聊天类型定义模块
 * @module
 */

import type {
  ModelInfo,
  AvailableCommand,
  RequestPermissionRequest,
} from '@agentclientprotocol/sdk';
import type { AskUserQuestionRequest } from './acpTypes.js';
import type { ApprovalModeValue } from './approvalModeValueTypes.js';

/** 聊天消息 */
export interface ChatMessage {
  /** 消息角色：用户、助手或思考 */
  role: 'user' | 'assistant' | 'thinking';
  /** 消息内容 */
  content: string;
  /** 时间戳 */
  timestamp: number;
}

/** 计划条目 */
export interface PlanEntry {
  /** 内容描述 */
  content: string;
  /** 优先级 */
  priority?: 'high' | 'medium' | 'low';
  /** 状态 */
  status: 'pending' | 'in_progress' | 'completed';
}

/** 工具调用更新数据 */
export interface ToolCallUpdateData {
  /** 工具调用 ID */
  toolCallId: string;
  /** 工具类型 */
  kind?: string;
  /** 标题 */
  title?: string;
  /** 状态 */
  status?: string;
  /** 原始输入 */
  rawInput?: unknown;
  /** 内容 */
  content?: Array<Record<string, unknown>>;
  /** 位置 */
  locations?: Array<{ path: string; line?: number | null }>;
  /** 时间戳 */
  timestamp?: number;
}

/** 使用统计载荷 */
export interface UsageStatsPayload {
  /** Token 使用情况 */
  usage?: {
    // SDK field names (primary)
    /** 输入 Token 数量 */
    inputTokens?: number | null;
    /** 输出 Token 数量 */
    outputTokens?: number | null;
    /** 思考 Token 数量 */
    thoughtTokens?: number | null;
    /** 总 Token 数量 */
    totalTokens?: number | null;
    /** 缓存读取 Token 数量 */
    cachedReadTokens?: number | null;
    /** 缓存写入 Token 数量 */
    cachedWriteTokens?: number | null;
    // Legacy field names (compat with older CLI builds)
    /** 提示 Token 数量（兼容旧版本） */
    promptTokens?: number | null;
    /** 完成 Token 数量（兼容旧版本） */
    completionTokens?: number | null;
    /** 思考 Token 数量（兼容旧版本） */
    thoughtsTokens?: number | null;
    /** 缓存 Token 数量（兼容旧版本） */
    cachedTokens?: number | null;
  } | null;
  /** 耗时（毫秒） */
  durationMs?: number | null;
  /** Token 限制 */
  tokenLimit?: number | null;
}

/**
 * Qwen Agent 回调接口
 * 定义与 Qwen Agent 交互的各种回调函数
 */
export interface QwenAgentCallbacks {
  /** 收到消息时的回调 */
  onMessage?: (message: ChatMessage) => void;
  /** 收到流式块时的回调 */
  onStreamChunk?: (chunk: string) => void;
  /** 收到思考块时的回调 */
  onThoughtChunk?: (chunk: string) => void;
  /** 工具调用更新时的回调 */
  onToolCall?: (update: ToolCallUpdateData) => void;
  /** 计划更新时的回调 */
  onPlan?: (entries: PlanEntry[]) => void;
  /** 请求权限时的回调 */
  onPermissionRequest?: (request: RequestPermissionRequest) => Promise<string>;
  /** 询问用户问题时的回调 */
  onAskUserQuestion?: (
    request: AskUserQuestionRequest,
  ) => Promise<{ optionId: string; answers?: Record<string, string> }>;
  /** 结束轮次时的回调 */
  onEndTurn?: (reason?: string) => void;
  /** 模式信息更新时的回调 */
  onModeInfo?: (info: {
    currentModeId?: ApprovalModeValue;
    availableModes?: Array<{
      id: ApprovalModeValue;
      name: string;
      description: string;
    }>;
  }) => void;
  /** 模式变更时的回调 */
  onModeChanged?: (modeId: ApprovalModeValue) => void;
  /** 使用统计更新时的回调 */
  onUsageUpdate?: (stats: UsageStatsPayload) => void;
  /** 模型信息更新时的回调 */
  onModelInfo?: (info: ModelInfo) => void;
  /** 模型变更时的回调 */
  onModelChanged?: (model: ModelInfo) => void;
  /** 可用命令更新时的回调 */
  onAvailableCommands?: (commands: AvailableCommand[]) => void;
  /** 可用模型更新时的回调 */
  onAvailableModels?: (models: ModelInfo[]) => void;
}

/**
 * 工具调用更新
 * 表示工具调用的完整信息
 */
export interface ToolCallUpdate {
  /** 消息类型 */
  type: 'tool_call' | 'tool_call_update';
  /** 工具调用 ID */
  toolCallId: string;
  /** 工具类型 */
  kind?: string;
  /** 标题 */
  title?: string;
  /** 状态 */
  status?: 'pending' | 'in_progress' | 'completed' | 'failed';
  /** 原始输入 */
  rawInput?: unknown;
  /** 内容数组 */
  content?: Array<{
    type: 'content' | 'diff';
    content?: {
      type: string;
      text?: string;
      [key: string]: unknown;
    };
    path?: string;
    oldText?: string | null;
    newText?: string;
    [key: string]: unknown;
  }>;
  /** 位置数组 */
  locations?: Array<{
    path: string;
    line?: number | null;
  }>;
  /** 时间戳（用于消息排序） */
  timestamp?: number;
  /** 服务器端元数据，包含用于正确排序的时间戳 */
  _meta?: {
    timestamp?: number;
    toolName?: string;
    [key: string]: unknown;
  };
}
