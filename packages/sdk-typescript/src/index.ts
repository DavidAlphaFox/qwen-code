/**
 * @fileoverview Qwen Code SDK 主入口文件
 *
 * 该模块提供了与 Qwen Code CLI 进程通信的完整功能，支持：
 * - 单轮和多轮查询会话
 * - 工具调用权限管理
 * - MCP (Model Context Protocol) 服务器集成
 * - 自定义 MCP 服务器嵌入
 *
 * @module @qwen-code/sdk
 */

// SDK 核心查询功能
export { query } from './query/createQuery.js';
export { AbortError, isAbortError } from './types/errors.js';
export { Query } from './query/Query.js';
export { SdkLogger } from './utils/logger.js';

// SDK MCP Server exports - MCP服务器相关导出
export { tool } from './mcp/tool.js';
export { createSdkMcpServer } from './mcp/createSdkMcpServer.js';

export type { SdkMcpToolDefinition } from './mcp/tool.js';

export type {
  CreateSdkMcpServerOptions,
  McpSdkServerConfigWithInstance,
} from './mcp/createSdkMcpServer.js';

// 查询选项相关类型导出
export type { QueryOptions } from './query/createQuery.js';

// 日志相关类型导出
export type { LogLevel, LoggerConfig, ScopedLogger } from './utils/logger.js';

// 协议相关类型导出
export type {
  ContentBlock,
  TextBlock,
  ThinkingBlock,
  ToolUseBlock,
  ToolResultBlock,
  SDKUserMessage,
  SDKAssistantMessage,
  SDKSystemMessage,
  SDKResultMessage,
  SDKPartialAssistantMessage,
  SDKMessage,
  SDKMcpServerConfig,
  ControlMessage,
  CLIControlRequest,
  CLIControlResponse,
  ControlCancelRequest,
  SubagentConfig,
  SubagentLevel,
  ModelConfig,
  RunConfig,
} from './types/protocol.js';

// 协议相关类型 guard 函数导出
export {
  isSDKUserMessage,
  isSDKAssistantMessage,
  isSDKSystemMessage,
  isSDKResultMessage,
  isSDKPartialAssistantMessage,
  isControlRequest,
  isControlResponse,
  isControlCancel,
} from './types/protocol.js';

// 类型定义相关类型导出
export type {
  PermissionMode,
  CanUseTool,
  PermissionResult,
  CLIMcpServerConfig,
  McpServerConfig,
  McpOAuthConfig,
  McpAuthProviderType,
} from './types/types.js';

// 类型 guard 函数导出
export { isSdkMcpServerConfig } from './types/types.js';
