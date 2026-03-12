/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 工具系统核心定义
 *
 * 本模块定义了 Qwen Code 项目的所有工具基类和接口，包括：
 * - ToolInvocation: 工具调用接口，表示已验证且可执行的工具调用
 * - ToolBuilder: 工具构建器接口，负责参数验证和创建调用实例
 * - DeclarativeTool: 声明式工具基类，将验证逻辑与执行逻辑分离
 * - ToolResult: 工具执行结果接口
 * - 各种确认细节接口和显示类型
 */

import type { FunctionDeclaration, Part, PartListUnion } from '@google/genai';
import { ToolErrorType } from './tool-error.js';
import type { DiffUpdateResult } from '../ide/ide-client.js';
import type { ShellExecutionConfig } from '../services/shellExecutionService.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { type SubagentStatsSummary } from '../subagents/subagent-statistics.js';
import type { AnsiOutput } from '../utils/terminalSerializer.js';

/**
 * Represents a validated and ready-to-execute tool call.
 * An instance of this is created by a `ToolBuilder`.
 *
 * 表示已验证且可执行的工具调用。
 * 此实例由 ToolBuilder 创建。
 */
export interface ToolInvocation<
  TParams extends object,
  TResult extends ToolResult,
> {
  /**
   * The validated parameters for this specific invocation.
   */
  params: TParams;

  /**
   * Gets a pre-execution description of the tool operation.
   *
   * @returns A markdown string describing what the tool will do.
   */
  getDescription(): string;

  /**
   * Determines what file system paths the tool will affect.
   * @returns A list of such paths.
   */
  toolLocations(): ToolLocation[];

  /**
   * Determines if the tool should prompt for confirmation before execution.
   * @returns Confirmation details or false if no confirmation is needed.
   */
  shouldConfirmExecute(
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false>;

  /**
   * Executes the tool with the validated parameters.
   * @param signal AbortSignal for tool cancellation.
   * @param updateOutput Optional callback to stream output.
   * @returns Result of the tool execution.
   */
  execute(
    signal: AbortSignal,
    updateOutput?: (output: ToolResultDisplay) => void,
    shellExecutionConfig?: ShellExecutionConfig,
  ): Promise<TResult>;
}
/**
 * A convenience base class for ToolInvocation.
 *
 * ToolInvocation 的便捷基类。
 */
export abstract class BaseToolInvocation<
  TParams extends object,
  TResult extends ToolResult,
> implements ToolInvocation<TParams, TResult> {
  constructor(readonly params: TParams) {}

  abstract getDescription(): string;

  toolLocations(): ToolLocation[] {
    return [];
  }

  shouldConfirmExecute(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    return Promise.resolve(false);
  }

  abstract execute(
    signal: AbortSignal,
    updateOutput?: (output: ToolResultDisplay) => void,
    shellExecutionConfig?: ShellExecutionConfig,
  ): Promise<TResult>;
}

/**
 * A type alias for a tool invocation where the specific parameter and result types are not known.
 *
 * 工具调用类型别名，用于参数和结果类型未知的工具调用。
 */
export type AnyToolInvocation = ToolInvocation<object, ToolResult>;

/**
 * Interface for a tool builder that validates parameters and creates invocations.
 *
 * 工具构建器接口，负责验证参数并创建调用实例。
 */
export interface ToolBuilder<
  TParams extends object,
  TResult extends ToolResult,
> {
  /**
   * The internal name of the tool (used for API calls).
   */
  name: string;

  /**
   * The user-friendly display name of the tool.
   */
  displayName: string;

  /**
   * Description of what the tool does.
   */
  description: string;

  /**
   * The kind of tool for categorization and permissions
   */
  kind: Kind;

  /**
   * Function declaration schema from @google/genai.
   */
  schema: FunctionDeclaration;

  /**
   * Whether the tool's output should be rendered as markdown.
   */
  isOutputMarkdown: boolean;

  /**
   * Whether the tool supports live (streaming) output.
   */
  canUpdateOutput: boolean;

  /**
   * Validates raw parameters and builds a ready-to-execute invocation.
   * @param params The raw, untrusted parameters from the model.
   * @returns A valid `ToolInvocation` if successful. Throws an error if validation fails.
   */
  build(params: TParams): ToolInvocation<TParams, TResult>;
}
/**
 * New base class for tools that separates validation from execution.
 * New tools should extend this class.
 *
 * 新的工具基类，将验证逻辑与执行逻辑分离。
 * 新工具应扩展此类。
 */
export abstract class DeclarativeTool<
  TParams extends object,
  TResult extends ToolResult,
> implements ToolBuilder<TParams, TResult> {
  constructor(
    readonly name: string,
    readonly displayName: string,
    readonly description: string,
    readonly kind: Kind,
    readonly parameterSchema: unknown,
    readonly isOutputMarkdown: boolean = true,
    readonly canUpdateOutput: boolean = false,
  ) {}

  get schema(): FunctionDeclaration {
    return {
      name: this.name,
      description: this.description,
      parametersJsonSchema: this.parameterSchema,
    };
  }

  /**
   * Validates the raw tool parameters.
   * Subclasses should override this to add custom validation logic
   * beyond the JSON schema check.
   * @param params The raw parameters from the model.
   * @returns An error message string if invalid, null otherwise.
   */
  validateToolParams(_params: TParams): string | null {
    // Base implementation can be extended by subclasses.
    return null;
  }

  /**
   * The core of the new pattern. It validates parameters and, if successful,
   * returns a `ToolInvocation` object that encapsulates the logic for the
   * specific, validated call.
   * @param params The raw, untrusted parameters from the model.
   * @returns A `ToolInvocation` instance.
   */
  abstract build(params: TParams): ToolInvocation<TParams, TResult>;

  /**
   * A convenience method that builds and executes the tool in one step.
   * Throws an error if validation fails.
   * @param params The raw, untrusted parameters from the model.
   * @param signal AbortSignal for tool cancellation.
   * @param updateOutput Optional callback to stream output.
   * @returns The result of the tool execution.
   */
  async buildAndExecute(
    params: TParams,
    signal: AbortSignal,
    updateOutput?: (output: ToolResultDisplay) => void,
    shellExecutionConfig?: ShellExecutionConfig,
  ): Promise<TResult> {
    const invocation = this.build(params);
    return invocation.execute(signal, updateOutput, shellExecutionConfig);
  }

  /**
   * Similar to `build` but never throws.
   * @param params The raw, untrusted parameters from the model.
   * @returns A `ToolInvocation` instance.
   */
  private silentBuild(
    params: TParams,
  ): ToolInvocation<TParams, TResult> | Error {
    try {
      return this.build(params);
    } catch (e) {
      if (e instanceof Error) {
        return e;
      }
      return new Error(String(e));
    }
  }

  /**
   * A convenience method that builds and executes the tool in one step.
   * Never throws.
   * @param params The raw, untrusted parameters from the model.
   * @params abortSignal a signal to abort.
   * @returns The result of the tool execution.
   */
  async validateBuildAndExecute(
    params: TParams,
    abortSignal: AbortSignal,
  ): Promise<ToolResult> {
    const invocationOrError = this.silentBuild(params);
    if (invocationOrError instanceof Error) {
      const errorMessage = invocationOrError.message;
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${errorMessage}`,
        returnDisplay: errorMessage,
        error: {
          message: errorMessage,
          type: ToolErrorType.INVALID_TOOL_PARAMS,
        },
      };
    }

    try {
      return await invocationOrError.execute(abortSignal);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error: Tool call execution failed. Reason: ${errorMessage}`,
        returnDisplay: errorMessage,
        error: {
          message: errorMessage,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }
  }
}

/**
 * New base class for declarative tools that separates validation from execution.
 * New tools should extend this class, which provides a `build` method that
 * validates parameters before deferring to a `createInvocation` method for
 * the final `ToolInvocation` object instantiation.
 *
 * 声明式工具的新基类，将验证逻辑与执行逻辑分离。
 * 新工具应扩展此类，它提供 `build` 方法在参数验证后委托给
 * `createInvocation` 方法进行最终的 ToolInvocation 对象实例化。
 */
export abstract class BaseDeclarativeTool<
  TParams extends object,
  TResult extends ToolResult,
> extends DeclarativeTool<TParams, TResult> {
  build(params: TParams): ToolInvocation<TParams, TResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      throw new Error(validationError);
    }
    return this.createInvocation(params);
  }

  override validateToolParams(params: TParams): string | null {
    const errors = SchemaValidator.validate(
      this.schema.parametersJsonSchema,
      params,
    );

    if (errors) {
      return errors;
    }
    return this.validateToolParamValues(params);
  }

  protected validateToolParamValues(_params: TParams): string | null {
    // Base implementation can be extended by subclasses.
    return null;
  }

  protected abstract createInvocation(
    params: TParams,
  ): ToolInvocation<TParams, TResult>;
}

/**
 * A type alias for a declarative tool where the specific parameter and result types are not known.
 *
 * 声明式工具的类型别名，用于参数和结果类型未知的工具。
 */
export type AnyDeclarativeTool = DeclarativeTool<object, ToolResult>;

/**
 * Type guard to check if an object is a Tool.
 * @param obj The object to check.
 * @returns True if the object is a Tool, false otherwise.
 *
 * 类型守卫，检查对象是否为 Tool。
 * @param obj 要检查的对象。
 * @returns 如果对象是 Tool 则为 true，否则为 false。
 */
export function isTool(obj: unknown): obj is AnyDeclarativeTool {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'name' in obj &&
    'build' in obj &&
    typeof (obj as AnyDeclarativeTool).build === 'function'
  );
}

/**
 * 工具执行结果接口
 */
export interface ToolResult {
  /**
   * Content meant to be included in LLM history.
   * This should represent the factual outcome of the tool execution.
   *
   * 用于包含在 LLM 历史中的内容。
   * 这应表示工具执行的事实结果。
   */
  llmContent: PartListUnion;

  /**
   * Markdown string for user display.
   * This provides a user-friendly summary or visualization of the result.
   * NOTE: This might also be considered UI-specific and could potentially be
   * removed or modified in a further refactor if the server becomes purely API-driven.
   * For now, we keep it as the core logic in ReadFileTool currently produces it.
   *
   * 用于用户显示的 Markdown 字符串。
   * 这提供了用户友好的结果摘要或可视化。
   * 注意：这可能被视为 UI 特定的内容，如果服务器变为纯 API 驱动，
   * 可能会在将来的重构中被删除或修改。
   * 目前，我们保留它，因为 ReadFileTool 的核心逻辑当前会生成它。
   */
  returnDisplay: ToolResultDisplay;

  /**
   * If this property is present, the tool call is considered a failure.
   *
   * 如果此属性存在，则工具调用被视为失败。
   */
  error?: {
    message: string; // raw error message - 原始错误消息
    type?: ToolErrorType; // An optional machine-readable error type (e.g., 'FILE_NOT_FOUND'). - 可选的机器可读错误类型（例如，'FILE_NOT_FOUND'）。
  };
}

/**
 * Detects cycles in a JSON schemas due to `$ref`s.
 * @param schema The root of the JSON schema.
 * @returns `true` if a cycle is detected, `false` otherwise.
 *
 * 检测由于 `$ref` 引起的 JSON schema 循环。
 * @param schema JSON schema 的根。
 * @returns 如果检测到循环则返回 `true`，否则返回 `false`。
 */
export function hasCycleInSchema(schema: object): boolean {
  function resolveRef(ref: string): object | null {
    if (!ref.startsWith('#/')) {
      return null;
    }
    const path = ref.substring(2).split('/');
    let current: unknown = schema;
    for (const segment of path) {
      if (
        typeof current !== 'object' ||
        current === null ||
        !Object.prototype.hasOwnProperty.call(current, segment)
      ) {
        return null;
      }
      current = (current as Record<string, unknown>)[segment];
    }
    return current as object;
  }

  function traverse(
    node: unknown,
    visitedRefs: Set<string>,
    pathRefs: Set<string>,
  ): boolean {
    if (typeof node !== 'object' || node === null) {
      return false;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        if (traverse(item, visitedRefs, pathRefs)) {
          return true;
        }
      }
      return false;
    }

    if ('$ref' in node && typeof node.$ref === 'string') {
      const ref = node.$ref;
      if (ref === '#/' || pathRefs.has(ref)) {
        // A ref to just '#/' is always a cycle.
        return true; // Cycle detected!
      }
      if (visitedRefs.has(ref)) {
        return false; // Bail early, we have checked this ref before.
      }

      const resolvedNode = resolveRef(ref);
      if (resolvedNode) {
        // Add it to both visited and the current path
        visitedRefs.add(ref);
        pathRefs.add(ref);
        const hasCycle = traverse(resolvedNode, visitedRefs, pathRefs);
        pathRefs.delete(ref); // Backtrack, leaving it in visited
        return hasCycle;
      }
    }

    // Crawl all the properties of node
    for (const key in node) {
      if (Object.prototype.hasOwnProperty.call(node, key)) {
        if (
          traverse(
            (node as Record<string, unknown>)[key],
            visitedRefs,
            pathRefs,
          )
        ) {
          return true;
        }
      }
    }

    return false;
  }

  return traverse(schema, new Set<string>(), new Set<string>());
}

/**
 * 任务执行结果显示接口
 */
export interface TaskResultDisplay {
  type: 'task_execution';
  subagentName: string;
  subagentColor?: string;
  taskDescription: string;
  taskPrompt: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  terminateReason?: string;
  result?: string;
  executionSummary?: SubagentStatsSummary;

  // If the subagent is awaiting approval for a tool call,
  // this contains the confirmation details for inline UI rendering.
  // 如果子代理正在等待工具调用的批准，这将包含用于内联 UI 渲染的确认详细信息。
  pendingConfirmation?: ToolCallConfirmationDetails;

  toolCalls?: Array<{
    callId: string;
    name: string;
    status: 'executing' | 'awaiting_approval' | 'success' | 'failed';
    error?: string;
    args?: Record<string, unknown>;
    result?: string;
    resultDisplay?: string;
    responseParts?: Part[];
    description?: string;
  }>;
}

/**
 * ANSI 输出显示接口
 */
export interface AnsiOutputDisplay {
  ansiOutput: AnsiOutput;
}

/**
 * Structured progress data following the MCP notifications/progress spec.
 * @see https://modelcontextprotocol.io/specification/2025-06-18/basic/utilities/progress
 *
 * 遵循 MCP notifications/progress 规范的结构化进度数据。
 */
export interface McpToolProgressData {
  type: 'mcp_tool_progress';
  /** Current progress value (must increase with each notification) - 当前进度值（每次通知必须增加） */
  progress: number;
  /** Optional total value indicating the operation's target - 表示操作目标的可选总值 */
  total?: number;
  /** Optional human-readable progress message - 可选的可读进度消息 */
  message?: string;
}

/**
 * 工具结果显示联合类型
 */
export type ToolResultDisplay =
  | string
  | FileDiff
  | TodoResultDisplay
  | PlanResultDisplay
  | TaskResultDisplay
  | AnsiOutputDisplay
  | McpToolProgressData;

/**
 * 文件差异显示接口
 */
export interface FileDiff {
  fileDiff: string;
  fileName: string;
  originalContent: string | null;
  newContent: string;
  diffStat?: DiffStat;
}

/**
 * 差异统计接口
 */
export interface DiffStat {
  model_added_lines: number;
  model_removed_lines: number;
  model_added_chars: number;
  model_removed_chars: number;
  user_added_lines: number;
  user_removed_lines: number;
  user_added_chars: number;
  user_removed_chars: number;
}

/**
 * 待办事项结果显示接口
 */
export interface TodoResultDisplay {
  type: 'todo_list';
  todos: Array<{
    id: string;
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
  }>;
}

/**
 * 计划结果显示接口
 */
export interface PlanResultDisplay {
  type: 'plan_summary';
  message: string;
  plan: string;
}

/**
 * 工具编辑确认详细信息接口
 */
export interface ToolEditConfirmationDetails {
  type: 'edit';
  title: string;
  onConfirm: (
    outcome: ToolConfirmationOutcome,
    payload?: ToolConfirmationPayload,
  ) => Promise<void>;
  fileName: string;
  filePath: string;
  fileDiff: string;
  originalContent: string | null;
  newContent: string;
  isModifying?: boolean;
  ideConfirmation?: Promise<DiffUpdateResult>;
}

/**
 * 工具确认负载接口
 */
export interface ToolConfirmationPayload {
  // used to override `modifiedProposedContent` for modifiable tools in the
  // inline modify flow
  // 用于在内联修改流程中为可修改工具覆盖 `modifiedProposedContent`
  newContent?: string;
  // used to provide custom cancellation message when outcome is Cancel
  // 用于在结果为 Cancel 时提供自定义取消消息
  cancelMessage?: string;
  // used to pass user answers from ask_user_question tool
  // 用于传递来自 ask_user_question 工具的用户答案
  answers?: Record<string, string>;
}

/**
 * 工具执行确认详细信息接口
 */
export interface ToolExecuteConfirmationDetails {
  type: 'exec';
  title: string;
  onConfirm: (
    outcome: ToolConfirmationOutcome,
    payload?: ToolConfirmationPayload,
  ) => Promise<void>;
  command: string;
  rootCommand: string;
}

/**
 * 工具 MCP 确认详细信息接口
 */
export interface ToolMcpConfirmationDetails {
  type: 'mcp';
  title: string;
  serverName: string;
  toolName: string;
  toolDisplayName: string;
  onConfirm: (
    outcome: ToolConfirmationOutcome,
    payload?: ToolConfirmationPayload,
  ) => Promise<void>;
}

/**
 * 工具信息确认详细信息接口
 */
export interface ToolInfoConfirmationDetails {
  type: 'info';
  title: string;
  onConfirm: (outcome: ToolConfirmationOutcome) => Promise<void>;
  prompt: string;
  urls?: string[];
}

/**
 * 工具调用确认详细信息联合类型
 */
export type ToolCallConfirmationDetails =
  | ToolEditConfirmationDetails
  | ToolExecuteConfirmationDetails
  | ToolMcpConfirmationDetails
  | ToolInfoConfirmationDetails
  | ToolPlanConfirmationDetails
  | ToolAskUserQuestionConfirmationDetails;

/**
 * 工具计划确认详细信息接口
 */
export interface ToolPlanConfirmationDetails {
  type: 'plan';
  title: string;
  plan: string;
  onConfirm: (outcome: ToolConfirmationOutcome) => Promise<void>;
}

/**
 * 工具询问用户问题确认详细信息接口
 */
export interface ToolAskUserQuestionConfirmationDetails {
  type: 'ask_user_question';
  title: string;
  questions: Array<{
    question: string;
    header: string;
    options: Array<{
      label: string;
      description: string;
    }>;
    multiSelect: boolean;
  }>;
  metadata?: {
    source?: string;
  };
  onConfirm: (
    outcome: ToolConfirmationOutcome,
    payload?: ToolConfirmationPayload,
  ) => Promise<void>;
}

/**
 * TODO:
 * 1. support explicit denied outcome
 * 2. support proceed with modified input
 *
 * 工具确认结果枚举
 */
export enum ToolConfirmationOutcome {
  ProceedOnce = 'proceed_once',
  ProceedAlways = 'proceed_always',
  ProceedAlwaysServer = 'proceed_always_server',
  ProceedAlwaysTool = 'proceed_always_tool',
  ModifyWithEditor = 'modify_with_editor',
  Cancel = 'cancel',
}

/**
 * 工具类型枚举
 */
export enum Kind {
  Read = 'read',
  Edit = 'edit',
  Delete = 'delete',
  Move = 'move',
  Search = 'search',
  Execute = 'execute',
  Think = 'think',
  Fetch = 'fetch',
  Other = 'other',
}

// Function kinds that have side effects
// 具有副作用的函数类型
export const MUTATOR_KINDS: Kind[] = [
  Kind.Edit,
  Kind.Delete,
  Kind.Move,
  Kind.Execute,
] as const;

/**
 * 工具位置接口
 */
export interface ToolLocation {
  // Absolute path to the file - 文件的绝对路径
  path: string;
  // Which line (if known) - 哪一行（如果已知）
  line?: number;
}
