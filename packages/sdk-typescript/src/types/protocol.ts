/* eslint-disable @typescript-eslint/no-explicit-any */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * 注释信息接口
 * 用于描述文本内容中的引用或标注信息
 */
export interface Annotation {
  /** 注释类型 */
  type: string;
  /** 注释值 */
  value: string;
}

/**
 * 使用量统计接口
 * 记录API调用的token使用情况
 */
export interface Usage {
  /** 输入token数量 */
  input_tokens: number;
  /** 输出token数量 */
  output_tokens: number;
  /** 缓存创建的输入token数量 */
  cache_creation_input_tokens?: number;
  /** 缓存读取的输入token数量 */
  cache_read_input_tokens?: number;
  /** 总token数量 */
  total_tokens?: number;
}

/**
 * 扩展使用量统计接口
 * 包含更详细的使用统计信息
 */
export interface ExtendedUsage extends Usage {
  /** 服务器工具使用统计 */
  server_tool_use?: {
    /** 网页搜索请求次数 */
    web_search_requests: number;
  };
  /** 服务层级 */
  service_tier?: string;
  /** 缓存创建详情 */
  cache_creation?: {
    /** 临时1小时输入token数量 */
    ephemeral_1h_input_tokens: number;
    /** 临时5分钟输入token数量 */
    ephemeral_5m_input_tokens: number;
  };
}

/**
 * 模型使用量接口
 * 用于展示模型级别的使用统计
 */
export interface ModelUsage {
  /** 输入token数量 */
  inputTokens: number;
  /** 输出token数量 */
  outputTokens: number;
  /** 缓存读取输入token数量 */
  cacheReadInputTokens: number;
  /** 缓存创建输入token数量 */
  cacheCreationInputTokens: number;
  /** 网页搜索请求次数 */
  webSearchRequests: number;
  /** 上下文窗口大小 */
  contextWindow: number;
}

/**
 * CLI权限拒绝接口
 * 当工具调用被拒绝时返回的详细信息
 */
export interface CLIPermissionDenial {
  /** 工具名称 */
  tool_name: string;
  /** 工具使用ID */
  tool_use_id: string;
  /** 工具输入参数 */
  tool_input: unknown;
}

/**
 * 文本内容块接口
 * 包含AI生成的文本内容
 */
export interface TextBlock {
  /** 内容块类型 */
  type: 'text';
  /** 文本内容 */
  text: string;
  /** 注释信息列表 */
  annotations?: Annotation[];
}

/**
 * 思考过程内容块接口
 * 包含AI的推理过程（适用于支持思考模式的模型）
 */
export interface ThinkingBlock {
  /** 内容块类型 */
  type: 'thinking';
  /** 思考内容 */
  thinking: string;
  /** 签名信息 */
  signature?: string;
  /** 注释信息列表 */
  annotations?: Annotation[];
}

/**
 * 工具调用内容块接口
 * 表示AI请求调用某个工具
 */
export interface ToolUseBlock {
  /** 内容块类型 */
  type: 'tool_use';
  /** 工具使用唯一标识 */
  id: string;
  /** 工具名称 */
  name: string;
  /** 工具输入参数 */
  input: unknown;
  /** 注释信息列表 */
  annotations?: Annotation[];
}

/**
 * 工具结果内容块接口
 * 包含工具执行的结果
 */
export interface ToolResultBlock {
  /** 内容块类型 */
  type: 'tool_result';
  /** 对应的工具使用ID */
  tool_use_id: string;
  /** 工具结果内容 */
  content?: string | ContentBlock[];
  /** 是否为错误结果 */
  is_error?: boolean;
  /** 注释信息列表 */
  annotations?: Annotation[];
}

/**
 * 内容块联合类型
 * 支持文本、思考、工具调用和工具结果
 */
export type ContentBlock =
  | TextBlock
  | ThinkingBlock
  | ToolUseBlock
  | ToolResultBlock;

/**
 * API用户消息接口
 * 用户发送给AI的消息
 */
export interface APIUserMessage {
  /** 消息角色 */
  role: 'user';
  /** 消息内容 */
  content: string | ContentBlock[];
}

/**
 * API助手消息接口
 * AI返回的完整消息
 */
export interface APIAssistantMessage {
  /** 消息ID */
  id: string;
  /** 消息类型 */
  type: 'message';
  /** 消息角色 */
  role: 'assistant';
  /** 使用的模型 */
  model: string;
  /** 消息内容列表 */
  content: ContentBlock[];
  /** 停止原因 */
  stop_reason?: string | null;
  /** 使用量统计 */
  usage: Usage;
}

/**
 * SDK用户消息接口
 * 在SDK和CLI之间传输的用户消息
 */
export interface SDKUserMessage {
  /** 消息类型 */
  type: 'user';
  /** 消息UUID */
  uuid?: string;
  /** 会话ID */
  session_id: string;
  /** 用户消息内容 */
  message: APIUserMessage;
  /** 父工具使用ID */
  parent_tool_use_id: string | null;
  /** 额外选项 */
  options?: Record<string, unknown>;
}

/**
 * SDK助手消息接口
 * 在SDK和CLI之间传输的助手消息
 */
export interface SDKAssistantMessage {
  /** 消息类型 */
  type: 'assistant';
  /** 消息UUID */
  uuid: string;
  /** 会话ID */
  session_id: string;
  /** 助手消息内容 */
  message: APIAssistantMessage;
  /** 父工具使用ID */
  parent_tool_use_id: string | null;
}

/**
 * SDK系统消息接口
 * 包含会话的初始化信息和系统配置
 */
export interface SDKSystemMessage {
  /** 消息类型 */
  type: 'system';
  /** 子类型 */
  subtype: string;
  /** 消息UUID */
  uuid: string;
  /** 会话ID */
  session_id: string;
  /** 消息数据 */
  data?: unknown;
  /** 当前工作目录 */
  cwd?: string;
  /** 可用工具列表 */
  tools?: string[];
  /** MCP服务器列表 */
  mcp_servers?: Array<{
    /** 服务器名称 */
    name: string;
    /** 服务器状态 */
    status: string;
  }>;
  /** 使用的模型 */
  model?: string;
  /** 权限模式 */
  permission_mode?: string;
  /** 可用斜杠命令 */
  slash_commands?: string[];
  /** Qwen Code版本 */
  qwen_code_version?: string;
  /** 输出样式 */
  output_style?: string;
  /** 可用代理列表 */
  agents?: string[];
  /** 可用技能列表 */
  skills?: string[];
  /** 能力配置 */
  capabilities?: Record<string, unknown>;
  /** 压缩元数据 */
  compact_metadata?: {
    /** 触发方式 */
    trigger: 'manual' | 'auto';
    /** 压缩前token数量 */
    pre_tokens: number;
  };
}

/**
 * SDK成功结果消息接口
 * 查询成功完成时返回的结果
 */
export interface SDKResultMessageSuccess {
  /** 消息类型 */
  type: 'result';
  /** 子类型 */
  subtype: 'success';
  /** 消息UUID */
  uuid: string;
  /** 会话ID */
  session_id: string;
  /** 是否为错误 */
  is_error: false;
  /** 总耗时（毫秒） */
  duration_ms: number;
  /** API调用耗时（毫秒） */
  duration_api_ms: number;
  /** 对话轮次 */
  num_turns: number;
  /** 执行结果 */
  result: string;
  /** 使用量统计 */
  usage: ExtendedUsage;
  /** 模型级别使用量 */
  modelUsage?: Record<string, ModelUsage>;
  /** 权限拒绝列表 */
  permission_denials: CLIPermissionDenial[];
  /** 额外字段 */
  [key: string]: unknown;
}

/**
 * SDK错误结果消息接口
 * 查询执行过程中发生错误时返回的结果
 */
export interface SDKResultMessageError {
  /** 消息类型 */
  type: 'result';
  /** 子类型 */
  subtype: 'error_max_turns' | 'error_during_execution';
  /** 消息UUID */
  uuid: string;
  /** 会话ID */
  session_id: string;
  /** 是否为错误 */
  is_error: true;
  /** 总耗时（毫秒） */
  duration_ms: number;
  /** API调用耗时（毫秒） */
  duration_api_ms: number;
  /** 对话轮次 */
  num_turns: number;
  /** 使用量统计 */
  usage: ExtendedUsage;
  /** 模型级别使用量 */
  modelUsage?: Record<string, ModelUsage>;
  /** 权限拒绝列表 */
  permission_denials: CLIPermissionDenial[];
  /** 错误信息 */
  error?: {
    /** 错误类型 */
    type?: string;
    /** 错误消息 */
    message: string;
    /** 额外字段 */
    [key: string]: unknown;
  };
  /** 额外字段 */
  [key: string]: unknown;
}

/**
 * SDK结果消息联合类型
 * 包含成功和错误两种结果消息
 */
export type SDKResultMessage = SDKResultMessageSuccess | SDKResultMessageError;

/**
 * 消息开始流事件接口
 */
export interface MessageStartStreamEvent {
  /** 事件类型 */
  type: 'message_start';
  /** 消息信息 */
  message: {
    /** 消息ID */
    id: string;
    /** 消息角色 */
    role: 'assistant';
    /** 模型名称 */
    model: string;
  };
}

/**
 * 内容块开始事件接口
 */
export interface ContentBlockStartEvent {
  /** 事件类型 */
  type: 'content_block_start';
  /** 内容块索引 */
  index: number;
  /** 内容块 */
  content_block: ContentBlock;
}

/**
 * 内容块增量更新联合类型
 */
export type ContentBlockDelta =
  | {
      /** 增量类型 */
      type: 'text_delta';
      /** 文本增量 */
      text: string;
    }
  | {
      /** 增量类型 */
      type: 'thinking_delta';
      /** 思考增量 */
      thinking: string;
    }
  | {
      /** 增量类型 */
      type: 'input_json_delta';
      /** 部分JSON */
      partial_json: string;
    };

/**
 * 内容块增量事件接口
 */
export interface ContentBlockDeltaEvent {
  /** 事件类型 */
  type: 'content_block_delta';
  /** 内容块索引 */
  index: number;
  /** 增量内容 */
  delta: ContentBlockDelta;
}

/**
 * 内容块结束事件接口
 */
export interface ContentBlockStopEvent {
  /** 事件类型 */
  type: 'content_block_stop';
  /** 内容块索引 */
  index: number;
}

/**
 * 消息结束流事件接口
 */
export interface MessageStopStreamEvent {
  /** 事件类型 */
  type: 'message_stop';
}

/**
 * 流事件联合类型
 */
export type StreamEvent =
  | MessageStartStreamEvent
  | ContentBlockStartEvent
  | ContentBlockDeltaEvent
  | ContentBlockStopEvent
  | MessageStopStreamEvent;

/**
 * SDK部分助手消息接口
 * 在流式响应过程中发送的不完整助手消息
 */
export interface SDKPartialAssistantMessage {
  /** 消息类型 */
  type: 'stream_event';
  /** 消息UUID */
  uuid: string;
  /** 会话ID */
  session_id: string;
  /** 流事件 */
  event: StreamEvent;
  /** 父工具使用ID */
  parent_tool_use_id: string | null;
}

/**
 * 权限模式类型
 * 控制工具调用的权限级别
 * - default: 默认模式，写操作需要确认
 * - plan: 计划模式，阻止所有写操作
 * - auto-edit: 自动编辑模式，自动批准编辑工具
 * - yolo: 无脑模式，所有工具自动执行
 */
export type PermissionMode = 'default' | 'plan' | 'auto-edit' | 'yolo';

/**
 * 认证类型
 * CLI支持的认证方式
 */
export type AuthType =
  | 'openai'
  | 'anthropic'
  | 'qwen-oauth'
  | 'gemini'
  | 'vertex-ai';

/**
 * 权限建议接口
 * 当工具调用需要确认时，AI可能提供的建议操作
 */
export interface PermissionSuggestion {
  /** 建议操作类型 */
  type: 'allow' | 'deny' | 'modify';
  /** 建议标签 */
  label: string;
  /** 建议描述 */
  description?: string;
  /** 修改后的输入参数 */
  modifiedInput?: unknown;
}

/**
 * 钩子注册接口
 * 用于注册事件钩子
 */
export interface HookRegistration {
  /** 事件名称 */
  event: string;
  callback_id: string;
}

/**
 * 钩子回调结果接口
 * 事件钩子执行后的返回结果
 */
export interface HookCallbackResult {
  /** 是否跳过当前操作 */
  shouldSkip?: boolean;
  /** 是否中断执行 */
  shouldInterrupt?: boolean;
  /** 是否抑制输出 */
  suppressOutput?: boolean;
  /** 消息内容 */
  message?: string;
}

/**
 * CLI中断请求接口
 * 请求中断当前正在执行的工具调用
 */
export interface CLIControlInterruptRequest {
  /** 请求子类型 */
  subtype: 'interrupt';
}

/**
 * CLI权限请求接口
 * 当工具需要用户确认时发送的请求
 */
export interface CLIControlPermissionRequest {
  /** 请求子类型 */
  subtype: 'can_use_tool';
  /** 工具名称 */
  tool_name: string;
  /** 工具使用ID */
  tool_use_id: string;
  /** 工具输入参数 */
  input: unknown;
  /** 权限建议列表 */
  permission_suggestions: PermissionSuggestion[] | null;
  /** 被阻止的路径（如有） */
  blocked_path: string | null;
}

/**
 * 认证提供者类型枚举
 * MCP服务器的认证方式
 */
export enum AuthProviderType {
  /** 动态发现 */
  DYNAMIC_DISCOVERY = 'dynamic_discovery',
  /** Google凭证 */
  GOOGLE_CREDENTIALS = 'google_credentials',
  /** 服务账号模拟 */
  SERVICE_ACCOUNT_IMPERSONATION = 'service_account_impersonation',
}

/**
 * MCP服务器配置接口
 * 配置外部MCP服务器的连接参数
 */
export interface MCPServerConfig {
  /** 执行命令 */
  command?: string;
  /** 命令参数 */
  args?: string[];
  /** 环境变量 */
  env?: Record<string, string>;
  /** 工作目录 */
  cwd?: string;
  /** SSE服务器URL */
  url?: string;
  /** HTTP服务器URL */
  httpUrl?: string;
  /** HTTP请求头 */
  headers?: Record<string, string>;
  /** TCP地址（WebSocket） */
  tcp?: string;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 是否信任此服务器 */
  trust?: boolean;
  /** 服务器描述 */
  description?: string;
  /** 包含的工具列表 */
  includeTools?: string[];
  /** 排除的工具列表 */
  excludeTools?: string[];
  /** 扩展名称 */
  extensionName?: string;
  /** OAuth配置 */
  oauth?: Record<string, unknown>;
  /** 认证提供者类型 */
  authProviderType?: AuthProviderType;
  /** 目标受众 */
  targetAudience?: string;
  /** 目标服务账号 */
  targetServiceAccount?: string;
}

/**
 * SDK MCP服务器配置接口
 *
 * SDK MCP服务器运行在SDK进程中，通过内存传输连接。
 * 工具调用通过SDK和CLI之间的控制平面进行路由。
 */
export interface SDKMcpServerConfig {
  /**
   * 类型标识符
   */
  type: 'sdk';
  /**
   * 服务器名称，用于识别和路由
   */
  name: string;
  /**
   * MCP服务器实例，由createSdkMcpServer()创建
   */
  instance: McpServer;
}

/**
 * 发送给CLI的SDK MCP服务器配置（有线格式）
 * 不包含实例对象
 */
export type WireSDKMcpServerConfig = Omit<SDKMcpServerConfig, 'instance'>;

/**
 * CLI初始化请求接口
 * SDK与CLI建立连接时发送的初始化请求
 */
export interface CLIControlInitializeRequest {
  /** 请求子类型 */
  subtype: 'initialize';
  /** 钩子注册列表 */
  hooks?: HookRegistration[] | null;
  /**
   * SDK MCP服务器配置
   * 这些是在SDK进程中运行的MCP服务器，通过控制平面连接。
   * 外部MCP服务器在设置中单独配置，不通过初始化请求。
   */
  sdkMcpServers?: Record<string, WireSDKMcpServerConfig>;
  /**
   * 应由CLI管理的外部MCP服务器
   */
  mcpServers?: Record<string, MCPServerConfig>;
  /** 代理配置列表 */
  agents?: SubagentConfig[];
}

/**
 * CLI设置权限模式请求接口
 */
export interface CLIControlSetPermissionModeRequest {
  /** 请求子类型 */
  subtype: 'set_permission_mode';
  /** 权限模式 */
  mode: PermissionMode;
}

/**
 * CLI钩子回调请求接口
 */
export interface CLIHookCallbackRequest {
  /** 请求子类型 */
  subtype: 'hook_callback';
  /** 回调ID */
  callback_id: string;
  /** 输入参数 */
  input: unknown;
  /** 工具使用ID */
  tool_use_id: string | null;
}

/**
 * CLI MCP消息请求接口
 * 用于SDK与MCP服务器之间的消息传递
 */
export interface CLIControlMcpMessageRequest {
  /** 请求子类型 */
  subtype: 'mcp_message';
  /** 服务器名称 */
  server_name: string;
  /** 消息内容 */
  message: {
    /** JSON-RPC版本 */
    jsonrpc?: string;
    /** 方法名称 */
    method: string;
    /** 方法参数 */
    params?: Record<string, unknown>;
    /** 消息ID */
    id?: string | number | null;
  };
}

/**
 * CLI设置模型请求接口
 */
export interface CLIControlSetModelRequest {
  /** 请求子类型 */
  subtype: 'set_model';
  /** 模型名称 */
  model: string;
}

/**
 * CLI MCP服务器状态请求接口
 */
export interface CLIControlMcpStatusRequest {
  /** 请求子类型 */
  subtype: 'mcp_server_status';
}

/**
 * CLI支持命令请求接口
 * 获取CLI支持的所有控制命令
 */
export interface CLIControlSupportedCommandsRequest {
  /** 请求子类型 */
  subtype: 'supported_commands';
}

/**
 * 控制请求负载联合类型
 * 所有可能的控制请求类型
 */
export type ControlRequestPayload =
  | CLIControlInterruptRequest
  | CLIControlPermissionRequest
  | CLIControlInitializeRequest
  | CLIControlSetPermissionModeRequest
  | CLIHookCallbackRequest
  | CLIControlMcpMessageRequest
  | CLIControlSetModelRequest
  | CLIControlMcpStatusRequest
  | CLIControlSupportedCommandsRequest;

/**
 * CLI控制请求接口
 * SDK向CLI发送的控制请求
 */
export interface CLIControlRequest {
  /** 消息类型 */
  type: 'control_request';
  /** 请求ID */
  request_id: string;
  /** 请求负载 */
  request: ControlRequestPayload;
}

/**
 * 权限批准接口
 */
export interface PermissionApproval {
  /** 是否允许 */
  allowed: boolean;
  /** 原因说明 */
  reason?: string;
  /** 修改后的输入参数 */
  modifiedInput?: unknown;
}

/**
 * 控制成功响应接口
 */
export interface ControlResponse {
  /** 响应子类型 */
  subtype: 'success';
  /** 请求ID */
  request_id: string;
  /** 响应数据 */
  response: unknown;
}

/**
 * 控制错误响应接口
 */
export interface ControlErrorResponse {
  /** 响应子类型 */
  subtype: 'error';
  /** 请求ID */
  request_id: string;
  /** 错误信息 */
  error: string | { message: string; [key: string]: unknown };
}

/**
 * CLI控制响应接口
 * CLI返回给SDK的控制响应
 */
export interface CLIControlResponse {
  /** 消息类型 */
  type: 'control_response';
  /** 响应内容 */
  response: ControlResponse | ControlErrorResponse;
}

/**
 * 控制取消请求接口
 * 取消待处理的控制请求
 */
export interface ControlCancelRequest {
  /** 消息类型 */
  type: 'control_cancel_request';
  /** 请求ID（可选） */
  request_id?: string;
}

/**
 * 控制消息联合类型
 * 所有控制消息类型
 */
export type ControlMessage =
  | CLIControlRequest
  | CLIControlResponse
  | ControlCancelRequest;

/**
 * SDK消息联合类型
 * 所有SDK消息类型
 */
export type SDKMessage =
  | SDKUserMessage
  | SDKAssistantMessage
  | SDKSystemMessage
  | SDKResultMessage
  | SDKPartialAssistantMessage;

/**
 * 判断消息是否为SDK用户消息
 * @param msg - 要检查的消息对象
 * @returns 如果是SDK用户消息返回true
 */
export function isSDKUserMessage(msg: any): msg is SDKUserMessage {
  return (
    msg && typeof msg === 'object' && msg.type === 'user' && 'message' in msg
  );
}

/**
 * 判断消息是否为SDK助手消息
 * @param msg - 要检查的消息对象
 * @returns 如果是SDK助手消息返回true
 */
export function isSDKAssistantMessage(msg: any): msg is SDKAssistantMessage {
  return (
    msg &&
    typeof msg === 'object' &&
    msg.type === 'assistant' &&
    'uuid' in msg &&
    'message' in msg &&
    'session_id' in msg &&
    'parent_tool_use_id' in msg
  );
}

/**
 * 判断消息是否为SDK系统消息
 * @param msg - 要检查的消息对象
 * @returns 如果是SDK系统消息返回true
 */
export function isSDKSystemMessage(msg: any): msg is SDKSystemMessage {
  return (
    msg &&
    typeof msg === 'object' &&
    msg.type === 'system' &&
    'subtype' in msg &&
    'uuid' in msg &&
    'session_id' in msg
  );
}

/**
 * 判断消息是否为SDK结果消息
 * @param msg - 要检查的消息对象
 * @returns 如果是SDK结果消息返回true
 */
export function isSDKResultMessage(msg: any): msg is SDKResultMessage {
  return (
    msg &&
    typeof msg === 'object' &&
    msg.type === 'result' &&
    'subtype' in msg &&
    'duration_ms' in msg &&
    'is_error' in msg &&
    'uuid' in msg &&
    'session_id' in msg
  );
}

/**
 * 判断消息是否为SDK部分助手消息
 * @param msg - 要检查的消息对象
 * @returns 如果是SDK部分助手消息返回true
 */
export function isSDKPartialAssistantMessage(
  msg: any,
): msg is SDKPartialAssistantMessage {
  return (
    msg &&
    typeof msg === 'object' &&
    msg.type === 'stream_event' &&
    'uuid' in msg &&
    'session_id' in msg &&
    'event' in msg &&
    'parent_tool_use_id' in msg
  );
}

/**
 * 判断消息是否为CLI控制请求
 * @param msg - 要检查的消息对象
 * @returns 如果是CLI控制请求返回true
 */
export function isControlRequest(msg: any): msg is CLIControlRequest {
  return (
    msg &&
    typeof msg === 'object' &&
    msg.type === 'control_request' &&
    'request_id' in msg &&
    'request' in msg
  );
}

/**
 * 判断消息是否为CLI控制响应
 * @param msg - 要检查的消息对象
 * @returns 如果是CLI控制响应返回true
 */
export function isControlResponse(msg: any): msg is CLIControlResponse {
  return (
    msg &&
    typeof msg === 'object' &&
    msg.type === 'control_response' &&
    'response' in msg
  );
}

/**
 * 判断消息是否为控制取消请求
 * @param msg - 要检查的消息对象
 * @returns 如果是控制取消请求返回true
 */
export function isControlCancel(msg: any): msg is ControlCancelRequest {
  return (
    msg &&
    typeof msg === 'object' &&
    msg.type === 'control_cancel_request' &&
    'request_id' in msg
  );
  );
}

/**
 * 判断内容块是否为文本块
 * @param block - 要检查的内容块
 * @returns 如果是文本块返回true
 */
export function isTextBlock(block: any): block is TextBlock {
  return block && typeof block === 'object' && block.type === 'text';
}

/**
 * 判断内容块是否为思考块
 * @param block - 要检查的内容块
 * @returns 如果是思考块返回true
 */
export function isThinkingBlock(block: any): block is ThinkingBlock {
  return block && typeof block === 'object' && block.type === 'thinking';
}

/**
 * 判断内容块是否为工具调用块
 * @param block - 要检查的内容块
 * @returns 如果是工具调用块返回true
 */
export function isToolUseBlock(block: any): block is ToolUseBlock {
  return block && typeof block === 'object' && block.type === 'tool_use';
}

/**
 * 判断内容块是否为工具结果块
 * @param block - 要检查的内容块
 * @returns 如果是工具结果块返回true
 */
export function isToolResultBlock(block: any): block is ToolResultBlock {
  return block && typeof block === 'object' && block.type === 'tool_result';
}

/**
 * 子代理级别类型
 */
export type SubagentLevel = 'session';

/**
 * 模型配置接口
 */
export interface ModelConfig {
  /** 模型名称 */
  model?: string;
  /** 温度参数 */
  temp?: number;
  /** top_p参数 */
  top_p?: number;
}

/**
 * 运行配置接口
 */
export interface RunConfig {
  /** 最大运行时间（分钟） */
  max_time_minutes?: number;
  /** 最大对话轮次 */
  max_turns?: number;
}

/**
 * 子代理配置接口
 * 配置可在会话中调用的子代理
 */
export interface SubagentConfig {
  /** 子代理名称 */
  name: string;
  /** 子代理描述 */
  description: string;
  /** 可用工具列表 */
  tools?: string[];
  /** 系统提示词 */
  systemPrompt: string;
  /** 子代理级别 */
  level: SubagentLevel;
  /** 子代理文件路径 */
  filePath?: string;
  /** 模型配置 */
  modelConfig?: Partial<ModelConfig>;
  /** 运行配置 */
  runConfig?: Partial<RunConfig>;
  /** 显示颜色 */
  color?: string;
  /** 是否为内置子代理 */
  readonly isBuiltin?: boolean;
}

/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 控制请求类型枚举
 * 
 * CLI支持的所有控制请求子类型的集中枚举。
 * 此枚举应与以下控制器保持同步：
 * - packages/cli/src/services/control/controllers/systemController.ts
 * - packages/cli/src/services/control/controllers/permissionController.ts
 * - packages/cli/src/services/control/controllers/mcpController.ts
 * - packages/cli/src/services/control/controllers/hookController.ts
 */
export enum ControlRequestType {
  // SystemController requests - 系统控制器请求
  INITIALIZE = 'initialize',
  INTERRUPT = 'interrupt',
  SET_MODEL = 'set_model',
  SUPPORTED_COMMANDS = 'supported_commands',

  // PermissionController requests - 权限控制器请求
  CAN_USE_TOOL = 'can_use_tool',
  SET_PERMISSION_MODE = 'set_permission_mode',

  // MCPController requests - MCP控制器请求
  MCP_MESSAGE = 'mcp_message',
  MCP_SERVER_STATUS = 'mcp_server_status',

  // HookController requests - 钩子控制器请求
  HOOK_CALLBACK = 'hook_callback',
}
