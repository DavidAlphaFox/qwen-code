/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * 适配器层 - 用于将不同数据格式规范化为统一的消息格式
 */

// 类型导出
export type {
  UnifiedMessage,
  UnifiedMessageType,
  JSONLMessage,
  ACPMessage,
  ACPMessageData,
  ToolCallData,
  FileContext,
} from './types.js';

// JSONL适配器（用于聊天查看器）
export { adaptJSONLMessages, filterEmptyMessages } from './JSONLAdapter.js';

// ACP适配器（用于vscode-ide-companion）
export {
  adaptACPMessages,
  isToolCallData,
  isMessageData,
} from './ACPAdapter.js';
