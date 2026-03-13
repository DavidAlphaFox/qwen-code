/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '@qwen-code/qwen-code-core';
import {
  OutputFormat,
  JsonFormatter,
  parseAndFormatApiError,
  FatalTurnLimitedError,
  FatalCancellationError,
  ToolErrorType,
  createDebugLogger,
} from '@qwen-code/qwen-code-core';
import { writeStderrLine } from './stdioHelpers.js';

const debugLogger = createDebugLogger('CLI_ERRORS');

/**
 * 从任意类型的错误中提取错误消息字符串
 * 支持 Error 对象、具有 message 属性的对象以及基本类型
 * @param error - 任意类型的错误对象
 * @returns string 错误消息字符串
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  // 处理具有 message 属性的类错误对象
  if (
    error !== null &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }

  // 通过字符串化处理普通对象
  if (error !== null && typeof error === 'object') {
    try {
      const stringified = JSON.stringify(error);
      // JSON.stringify 可以为 toJSON() 返回 undefined 的对象返回 undefined
      return stringified ?? String(error);
    } catch {
      // 如果 JSON.stringify 失败（如循环引用等），回退到 String
      return String(error);
    }
  }

  return String(error);
}

/** 扩展的 Error 接口，包含退出码和状态信息 */
interface ErrorWithCode extends Error {
  /** 退出码 */
  exitCode?: number;
  /** 错误代码 */
  code?: string | number;
  /** HTTP 状态码 */
  status?: string | number;
}

/**
 * 从错误对象中提取适当的错误代码
 * @param error - 错误对象
 * @returns string | number 错误代码
 */
function extractErrorCode(error: unknown): string | number {
  const errorWithCode = error as ErrorWithCode;

  // 优先使用 FatalError 类型的 exitCode，其次回退到其他代码
  if (typeof errorWithCode.exitCode === 'number') {
    return errorWithCode.exitCode;
  }
  if (errorWithCode.code !== undefined) {
    return errorWithCode.code;
  }
  if (errorWithCode.status !== undefined) {
    return errorWithCode.status;
  }

  return 1; // 默认退出码
}

/**
 * 将错误代码转换为数字退出码
 * @param errorCode - 错误代码（字符串或数字）
 * @returns number 数字退出码
 */
function getNumericExitCode(errorCode: string | number): number {
  return typeof errorCode === 'number' ? errorCode : 1;
}

/**
 * 统一处理 JSON 和文本输出格式的错误
 * 在 JSON 模式下，输出格式化的 JSON 错误并退出
 * 在文本模式下，输出错误消息并重新抛出
 * @param error - 错误对象
 * @param config - 应用程序配置
 * @param customErrorCode - 可选的自定义错误代码
 * @returns never 此函数不会返回，总是终止进程
 */
export function handleError(
  error: unknown,
  config: Config,
  customErrorCode?: string | number,
): never {
  const errorMessage = parseAndFormatApiError(
    error,
    config.getContentGeneratorConfig()?.authType,
  );

  if (config.getOutputFormat() === OutputFormat.JSON) {
    const formatter = new JsonFormatter();
    const errorCode = customErrorCode ?? extractErrorCode(error);

    const formattedError = formatter.formatError(
      error instanceof Error ? error : new Error(getErrorMessage(error)),
      errorCode,
    );

    writeStderrLine(formattedError);
    process.exit(getNumericExitCode(errorCode));
  } else {
    writeStderrLine(errorMessage);
    throw error;
  }
}

/**
 * 专门处理工具执行错误
 * 在 JSON/STREAM_JSON 模式下，仅将错误消息输出到 stderr 不退出
 * 错误将由适配器在 tool_result 块中正确格式化，允许会话继续以便 LLM 决定下一步操作
 * 在文本模式下，仅将错误消息输出到 stderr
 * @param toolName - 失败的工具名称
 * @param toolError - 工具执行期间发生的错误
 * @param config - 应用程序配置对象
 * @param errorCode - 可选的错误代码
 * @param resultDisplay - 可选的错误显示消息
 */
export function handleToolError(
  toolName: string,
  toolError: Error,
  config: Config,
  errorCode?: string | number,
  resultDisplay?: string,
): void {
  // 检查是否是非交互模式下的权限拒绝错误
  const isExecutionDenied = errorCode === ToolErrorType.EXECUTION_DENIED;
  const isNonInteractive = !config.isInteractive();
  const isTextMode = config.getOutputFormat() === OutputFormat.TEXT;

  // 在非交互式文本模式下显示权限拒绝警告
  if (isExecutionDenied && isNonInteractive && isTextMode) {
    const warningMessage =
      `Warning: Tool "${toolName}" requires user approval but cannot execute in non-interactive mode.\n` +
      `To enable automatic tool execution, use the -y flag (YOLO mode):\n` +
      `Example: qwen -p 'your prompt' -y\n\n`;
    process.stderr.write(warningMessage);
  }

  debugLogger.error(
    `Error executing tool ${toolName}: ${resultDisplay || toolError.message}`,
  );
}

/**
 * 统一处理取消/中止信号
 * @param config - 应用程序配置
 * @returns never 此函数不会返回，总是终止进程
 */
export function handleCancellationError(config: Config): never {
  const cancellationError = new FatalCancellationError('Operation cancelled.');

  if (config.getOutputFormat() === OutputFormat.JSON) {
    const formatter = new JsonFormatter();
    const formattedError = formatter.formatError(
      cancellationError,
      cancellationError.exitCode,
    );

    writeStderrLine(formattedError);
    process.exit(cancellationError.exitCode);
  } else {
    writeStderrLine(cancellationError.message);
    process.exit(cancellationError.exitCode);
  }
}

/**
 * 统一处理最大会话轮次超出错误
 * @param config - 应用程序配置
 * @returns never 此函数不会返回，总是终止进程
 */
export function handleMaxTurnsExceededError(config: Config): never {
  const maxTurnsError = new FatalTurnLimitedError(
    'Reached max session turns for this session. Increase the number of turns by specifying maxSessionTurns in settings.json.',
  );

  if (config.getOutputFormat() === OutputFormat.JSON) {
    const formatter = new JsonFormatter();
    const formattedError = formatter.formatError(
      maxTurnsError,
      maxTurnsError.exitCode,
    );

    writeStderrLine(formattedError);
    process.exit(maxTurnsError.exitCode);
  } else {
    writeStderrLine(maxTurnsError.message);
    process.exit(maxTurnsError.exitCode);
  }
}
