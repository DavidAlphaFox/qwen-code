/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  FinishReason,
  type Part,
  type PartListUnion,
  type GenerateContentResponse,
  type FunctionCall,
  type FunctionDeclaration,
  type GenerateContentResponseUsageMetadata,
} from '@google/genai';
import type {
  ToolCallConfirmationDetails,
  ToolResult,
  ToolResultDisplay,
} from '../tools/tools.js';
import type { ToolErrorType } from '../tools/tool-error.js';
import { getResponseText } from '../utils/partUtils.js';
import { reportError } from '../utils/errorReporting.js';
import {
  getErrorMessage,
  UnauthorizedError,
  toFriendlyError,
} from '../utils/errors.js';
import type { GeminiChat } from './geminiChat.js';
import type { RetryInfo } from '../utils/rateLimit.js';
import {
  getThoughtText,
  parseThought,
  type ThoughtSummary,
} from '../utils/thoughtUtils.js';

// 定义传递给服务器的工具有效结构
/**
 * 服务器工具定义
 */
export interface ServerTool {
  /** 工具名称 */
  name: string;
  /** 函数模式定义 */
  schema: FunctionDeclaration;
  // 执行方法的签名可能略有不同或被包装
  /**
   * 执行工具函数
   * @param params - 工具参数
   * @param signal - 中止信号
   * @returns 工具执行结果
   */
  execute(
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<ToolResult>;
  /**
   * 检查工具调用是否需要确认
   * @param params - 工具参数
   * @param abortSignal - 中止信号
   * @returns 确认详情或 false
   */
  shouldConfirmExecute(
    params: Record<string, unknown>,
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false>;
}

/**
 * Gemini 事件类型枚举
 */
export enum GeminiEventType {
  /** 内容事件 */
  Content = 'content',
  /** 工具调用请求 */
  ToolCallRequest = 'tool_call_request',
  /** 工具调用响应 */
  ToolCallResponse = 'tool_call_response',
  /** 工具调用确认 */
  ToolCallConfirmation = 'tool_call_confirmation',
  /** 用户取消 */
  UserCancelled = 'user_cancelled',
  /** 错误 */
  Error = 'error',
  /** 聊天压缩 */
  ChatCompressed = 'chat_compressed',
  /** 思考 */
  Thought = 'thought',
  /** 最大会话轮次 */
  MaxSessionTurns = 'max_session_turns',
  /** 会话令牌限制超出 */
  SessionTokenLimitExceeded = 'session_token_limit_exceeded',
  /** 完成 */
  Finished = 'finished',
  /** 检测到循环 */
  LoopDetected = 'loop_detected',
  /** 引用 */
  Citation = 'citation',
  /** 重试 */
  Retry = 'retry',
  /** Hook 系统消息 */
  HookSystemMessage = 'hook_system_message',
}

/**
 * 服务器 Gemini 重试事件
 */
export type ServerGeminiRetryEvent = {
  /** 事件类型为重试 */
  type: GeminiEventType.Retry;
  /** 重试信息 */
  retryInfo?: RetryInfo;
};

/**
 * 结构化错误
 */
export interface StructuredError {
  /** 错误消息 */
  message: string;
  /** HTTP 状态码 */
  status?: number;
}

/**
 * Gemini 错误事件值
 */
export interface GeminiErrorEventValue {
  /** 错误对象 */
  error: StructuredError;
}

/**
 * 会话令牌限制超出值
 */
export interface SessionTokenLimitExceededValue {
  /** 当前令牌数 */
  currentTokens: number;
  /** 限制 */
  limit: number;
  /** 消息 */
  message: string;
}

/**
 * Gemini 完成事件值
 */
export interface GeminiFinishedEventValue {
  /** 完成原因 */
  reason: FinishReason | undefined;
  /** 使用元数据 */
  usageMetadata: GenerateContentResponseUsageMetadata | undefined;
}

/**
 * 工具调用请求信息
 */
export interface ToolCallRequestInfo {
  /** 调用 ID */
  callId: string;
  /** 工具名称 */
  name: string;
  /** 工具参数 */
  args: Record<string, unknown>;
  /** 是否由客户端发起 */
  isClientInitiated: boolean;
  /** 提示 ID */
  prompt_id: string;
  /** 响应 ID */
  response_id?: string;
  /** 当 LLM 响应因 max_tokens 而被截断时设为 true */
  wasOutputTruncated?: boolean;
}

/**
 * 工具调用响应信息
 */
export interface ToolCallResponseInfo {
  /** 调用 ID */
  callId: string;
  /** 响应部分 */
  responseParts: Part[];
  /** 结果显示 */
  resultDisplay: ToolResultDisplay | undefined;
  /** 错误 */
  error: Error | undefined;
  /** 错误类型 */
  errorType: ToolErrorType | undefined;
  /** 输出文件 */
  outputFile?: string | undefined;
  /** 内容长度 */
  contentLength?: number;
}

/**
 * 服务器工具调用确认详情
 */
export interface ServerToolCallConfirmationDetails {
  /** 请求 */
  request: ToolCallRequestInfo;
  /** 确认详情 */
  details: ToolCallConfirmationDetails;
}

/**
 * 服务器 Gemini 内容事件
 */
export type ServerGeminiContentEvent = {
  /** 事件类型 */
  type: GeminiEventType.Content;
  /** 内容值 */
  value: string;
};

/**
 * 服务器 Gemini 思考事件
 */
export type ServerGeminiThoughtEvent = {
  /** 事件类型 */
  type: GeminiEventType.Thought;
  /** 思考摘要 */
  value: ThoughtSummary;
};

/**
 * 服务器 Gemini 工具调用请求事件
 */
export type ServerGeminiToolCallRequestEvent = {
  /** 事件类型 */
  type: GeminiEventType.ToolCallRequest;
  /** 工具调用请求信息 */
  value: ToolCallRequestInfo;
};

/**
 * 服务器 Gemini 工具调用响应事件
 */
export type ServerGeminiToolCallResponseEvent = {
  /** 事件类型 */
  type: GeminiEventType.ToolCallResponse;
  /** 工具调用响应信息 */
  value: ToolCallResponseInfo;
};

/**
 * 服务器 Gemini 工具调用确认事件
 */
export type ServerGeminiToolCallConfirmationEvent = {
  /** 事件类型 */
  type: GeminiEventType.ToolCallConfirmation;
  /** 工具调用确认详情 */
  value: ServerToolCallConfirmationDetails;
};

/**
 * 服务器 Gemini 用户取消事件
 */
export type ServerGeminiUserCancelledEvent = {
  /** 事件类型 */
  type: GeminiEventType.UserCancelled;
};

/**
 * 服务器 Gemini 错误事件
 */
export type ServerGeminiErrorEvent = {
  /** 事件类型 */
  type: GeminiEventType.Error;
  /** 错误事件值 */
  value: GeminiErrorEventValue;
};

/**
 * 压缩状态枚举
 */
export enum CompressionStatus {
  /** 压缩成功 */
  COMPRESSED = 1,

  /** 由于压缩导致令牌数增加而压缩失败 */
  COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,

  /** 由于计算令牌数出错导致压缩失败 */
  COMPRESSION_FAILED_TOKEN_COUNT_ERROR,

  /** 由于收到空或 null 摘要导致压缩失败 */
  COMPRESSION_FAILED_EMPTY_SUMMARY,

  /** 不需要压缩，未执行任何操作 */
  NOOP,
}

/**
 * 聊天压缩信息
 */
export interface ChatCompressionInfo {
  /** 原始令牌数 */
  originalTokenCount: number;
  /** 压缩后令牌数 */
  newTokenCount: number;
  /** 压缩状态 */
  compressionStatus: CompressionStatus;
}

/**
 * 服务器 Gemini 聊天压缩事件
 */
export type ServerGeminiChatCompressedEvent = {
  /** 事件类型 */
  type: GeminiEventType.ChatCompressed;
  /** 聊天压缩信息或 null */
  value: ChatCompressionInfo | null;
};

/**
 * 服务器 Gemini 最大会话轮次事件
 */
export type ServerGeminiMaxSessionTurnsEvent = {
  /** 事件类型 */
  type: GeminiEventType.MaxSessionTurns;
};

/**
 * 服务器 Gemini 会话令牌限制超出事件
 */
export type ServerGeminiSessionTokenLimitExceededEvent = {
  /** 事件类型 */
  type: GeminiEventType.SessionTokenLimitExceeded;
  /** 会话令牌限制超出值 */
  value: SessionTokenLimitExceededValue;
};

/**
 * 服务器 Gemini 完成事件
 */
export type ServerGeminiFinishedEvent = {
  /** 事件类型 */
  type: GeminiEventType.Finished;
  /** 完成事件值 */
  value: GeminiFinishedEventValue;
};

/**
 * 服务器 Gemini 循环检测事件
 */
export type ServerGeminiLoopDetectedEvent = {
  /** 事件类型 */
  type: GeminiEventType.LoopDetected;
};

/**
 * 服务器 Gemini 引用事件
 */
export type ServerGeminiCitationEvent = {
  /** 事件类型 */
  type: GeminiEventType.Citation;
  /** 引用值 */
  value: string;
};

/**
 * 服务器 Gemini Hook 系统消息事件
 */
export type ServerGeminiHookSystemMessageEvent = {
  /** 事件类型 */
  type: GeminiEventType.HookSystemMessage;
  /** 消息值 */
  value: string;
};

// 原始联合类型，由各个类型组合而成
/**
 * 服务器 Gemini 流事件联合类型
 */
export type ServerGeminiStreamEvent =
  | ServerGeminiChatCompressedEvent
  | ServerGeminiCitationEvent
  | ServerGeminiContentEvent
  | ServerGeminiErrorEvent
  | ServerGeminiFinishedEvent
  | ServerGeminiHookSystemMessageEvent
  | ServerGeminiLoopDetectedEvent
  | ServerGeminiMaxSessionTurnsEvent
  | ServerGeminiThoughtEvent
  | ServerGeminiToolCallConfirmationEvent
  | ServerGeminiToolCallRequestEvent
  | ServerGeminiToolCallResponseEvent
  | ServerGeminiUserCancelledEvent
  | ServerGeminiSessionTokenLimitExceededEvent
  | ServerGeminiRetryEvent;

// 一个 turn 管理服务器上下文中的 agentic loop turn
/**
 * Turn 类 - 管理服务器上下文中的 agentic loop turn
 */
export class Turn {
  readonly pendingToolCalls: ToolCallRequestInfo[] = [];
  private debugResponses: GenerateContentResponse[] = [];
  private pendingCitations = new Set<string>();
  finishReason: FinishReason | undefined = undefined;
  private currentResponseId?: string;

  constructor(
    private readonly chat: GeminiChat,
    private readonly prompt_id: string,
  ) {}
  /**
   * 运行方法，生成更适合服务器逻辑的简化事件
   * @param model - 模型名称
   * @param req - 消息内容
   * @param signal - 中止信号
   * @returns 服务器 Gemini 流事件的异步生成器
   */
  async *run(
    model: string,
    req: PartListUnion,
    signal: AbortSignal,
  ): AsyncGenerator<ServerGeminiStreamEvent> {
    try {
      // Note: This assumes `sendMessageStream` yields events like
      // { type: StreamEventType.RETRY } or { type: StreamEventType.CHUNK, value: GenerateContentResponse }
      const responseStream = await this.chat.sendMessageStream(
        model,
        {
          message: req,
          config: {
            abortSignal: signal,
          },
        },
        this.prompt_id,
      );

      for await (const streamEvent of responseStream) {
        if (signal?.aborted) {
          yield { type: GeminiEventType.UserCancelled };
          return;
        }

        // Handle the new RETRY event
        if (streamEvent.type === 'retry') {
          yield {
            type: GeminiEventType.Retry,
            retryInfo: streamEvent.retryInfo,
          };
          continue; // Skip to the next event in the stream
        }

        // Assuming other events are chunks with a `value` property
        const resp = streamEvent.value as GenerateContentResponse;
        if (!resp) continue; // Skip if there's no response body

        this.debugResponses.push(resp);

        // Track the current response ID for tool call correlation
        if (resp.responseId) {
          this.currentResponseId = resp.responseId;
        }

        const thoughtText = getThoughtText(resp);
        if (thoughtText) {
          yield {
            type: GeminiEventType.Thought,
            value: parseThought(thoughtText),
          };
        }

        const text = getResponseText(resp);
        if (text) {
          yield { type: GeminiEventType.Content, value: text };
        }

        // Handle function calls (requesting tool execution)
        const functionCalls = resp.functionCalls ?? [];
        for (const fnCall of functionCalls) {
          const event = this.handlePendingFunctionCall(fnCall);
          if (event) {
            yield event;
          }
        }

        for (const citation of getCitations(resp)) {
          this.pendingCitations.add(citation);
        }

        // Check if response was truncated or stopped for various reasons
        const finishReason = resp.candidates?.[0]?.finishReason;

        // This is the key change: Only yield 'Finished' if there is a finishReason.
        if (finishReason) {
          // Mark pending tool calls so downstream can distinguish
          // truncation from real parameter errors.
          if (finishReason === FinishReason.MAX_TOKENS) {
            for (const tc of this.pendingToolCalls) {
              tc.wasOutputTruncated = true;
            }
          }

          if (this.pendingCitations.size > 0) {
            yield {
              type: GeminiEventType.Citation,
              value: `Citations:\n${[...this.pendingCitations].sort().join('\n')}`,
            };
            this.pendingCitations.clear();
          }

          this.finishReason = finishReason;
          yield {
            type: GeminiEventType.Finished,
            value: {
              reason: finishReason,
              usageMetadata: resp.usageMetadata,
            },
          };
        }
      }
    } catch (e) {
      if (signal.aborted) {
        yield { type: GeminiEventType.UserCancelled };
        // Regular cancellation error, fail gracefully.
        return;
      }

      const error = toFriendlyError(e);
      if (error instanceof UnauthorizedError) {
        throw error;
      }

      const contextForReport = [...this.chat.getHistory(/*curated*/ true), req];
      await reportError(
        error,
        'Error when talking to API',
        contextForReport,
        'Turn.run-sendMessageStream',
      );
      const status =
        typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        typeof (error as { status: unknown }).status === 'number'
          ? (error as { status: number }).status
          : undefined;
      const structuredError: StructuredError = {
        message: getErrorMessage(error),
        status,
      };
      await this.chat.maybeIncludeSchemaDepthContext(structuredError);
      yield { type: GeminiEventType.Error, value: { error: structuredError } };
      return;
    }
  }

  /**
   * 处理待处理的函数调用
   * @param fnCall - 函数调用对象
   * @returns 服务器 Gemini 流事件或 null
   */
  private handlePendingFunctionCall(
    fnCall: FunctionCall,
  ): ServerGeminiStreamEvent | null {
    const callId =
      fnCall.id ??
      `${fnCall.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const name = fnCall.name || 'undefined_tool_name';
    const args = (fnCall.args || {}) as Record<string, unknown>;

    const toolCallRequest: ToolCallRequestInfo = {
      callId,
      name,
      args,
      isClientInitiated: false,
      prompt_id: this.prompt_id,
      response_id: this.currentResponseId,
    };

    this.pendingToolCalls.push(toolCallRequest);

    // Yield a request for the tool call, not the pending/confirming status
    return { type: GeminiEventType.ToolCallRequest, value: toolCallRequest };
  }

  /**
   * 获取调试响应
   * @returns 生成的响应数组
   */
  getDebugResponses(): GenerateContentResponse[] {
    return this.debugResponses;
  }
}

function getCitations(resp: GenerateContentResponse): string[] {
  return (resp.candidates?.[0]?.citationMetadata?.citations ?? [])
    .filter((citation) => citation.uri !== undefined)
    .map((citation) => {
      if (citation.title) {
        return `(${citation.title}) ${citation.uri}`;
      }
      return citation.uri!;
    });
}
