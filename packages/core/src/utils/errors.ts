/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Gaxios 错误接口定义
 * 用于类型检查和错误响应的数据结构
 */
interface GaxiosError {
  response?: {
    data?: unknown;
  };
}

/**
 * 检查错误是否是 Node.js 原生错误类型
 * @param error - 要检查的错误对象
 * @returns 如果是 NodeJS.ErrnoException 类型返回 true，否则返回 false
 */
export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

/**
 * 检查错误是否是中止错误（用户取消操作）
 * 处理 DOMException 风格的 AbortError 和 Node.js 中止错误
 * @param error - 要检查的错误对象
 * @returns 如果是中止错误返回 true，否则返回 false
 */
export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  // Check for AbortError by name (standard DOMException and custom AbortError)
  if (error instanceof Error && error.name === 'AbortError') {
    return true;
  }

  // Check for Node.js abort error code
  if (isNodeError(error) && error.code === 'ABORT_ERR') {
    return true;
  }

  return false;
}

/**
 * 从任意对象中提取错误消息字符串
 * @param error - 任意类型的错误对象
 * @returns 错误消息字符串
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  try {
    return String(error);
  } catch {
    return 'Failed to get error details';
  }
}

/**
 * 致命错误类
 * 表示导致程序必须终止的严重错误
 * @extends Error
 */
export class FatalError extends Error {
  /**
   * 创建致命错误实例
   * @param message - 错误消息
   * @param exitCode - 退出代码
   */
  constructor(
    message: string,
    readonly exitCode: number,
  ) {
    super(message);
  }
}

/**
 * 认证失败导致的致命错误
 * 表示需要重新进行身份验证的错误情况
 * @extends FatalError
 */
export class FatalAuthenticationError extends FatalError {
  /**
   * 创建认证错误实例
   * @param message - 错误消息
   */
  constructor(message: string) {
    super(message, 41);
  }
}

/**
 * 输入参数错误导致的致命错误
 * @extends FatalError
 */
export class FatalInputError extends FatalError {
  /**
   * 创建输入错误实例
   * @param message - 错误消息
   */
  constructor(message: string) {
    super(message, 42);
  }
}

/**
 * 沙箱安全错误
 * @extends FatalError
 */
export class FatalSandboxError extends FatalError {
  /**
   * 创建沙箱错误实例
   * @param message - 错误消息
   */
  constructor(message: string) {
    super(message, 44);
  }
}

/**
 * 配置错误导致的致命错误
 * @extends FatalError
 */
export class FatalConfigError extends FatalError {
  /**
   * 创建配置错误实例
   * @param message - 错误消息
   */
  constructor(message: string) {
    super(message, 52);
  }
}

/**
 * 轮次限制错误
 * @extends FatalError
 */
export class FatalTurnLimitedError extends FatalError {
  /**
   * 创建轮次限制错误实例
   * @param message - 错误消息
   */
  constructor(message: string) {
    super(message, 53);
  }
}

/**
 * 工具执行错误
 * @extends FatalError
 */
export class FatalToolExecutionError extends FatalError {
  /**
   * 创建工具执行错误实例
   * @param message - 错误消息
   */
  constructor(message: string) {
    super(message, 54);
  }
}

/**
 * 取消操作错误
 * @extends FatalError
 */
export class FatalCancellationError extends FatalError {
  /**
   * 创建取消错误实例
   * @param message - 错误消息
   */
  constructor(message: string) {
    super(message, 130); // 标准退出代码 SIGINT
  }
}

/**
 * 禁止访问错误
 * @extends Error
 */
export class ForbiddenError extends Error {}
/**
 * 未授权错误
 * @extends Error
 */
export class UnauthorizedError extends Error {}
/**
 * 错误请求错误
 * @extends Error
 */
export class BadRequestError extends Error {}

/**
 * 响应数据接口
 */
interface ResponseData {
  error?: {
    code?: number;
    message?: string;
  };
}

/**
 * 将错误转换为更友好的自定义错误类型
 * 根据 HTTP 状态码将 Gaxios 错误转换为对应的自定义错误类
 * @param error - 原始错误对象
 * @returns 转换后的错误对象，如果不需要转换则返回原始错误
 */
export function toFriendlyError(error: unknown): unknown {
  if (error && typeof error === 'object' && 'response' in error) {
    const gaxiosError = error as GaxiosError;
    const data = parseResponseData(gaxiosError);
    if (data.error && data.error.message && data.error.code) {
      switch (data.error.code) {
        case 400:
          return new BadRequestError(data.error.message);
        case 401:
          return new UnauthorizedError(data.error.message);
        case 403:
          // It's import to pass the message here since it might
          // explain the cause like "the cloud project you're
          // using doesn't have code assist enabled".
          return new ForbiddenError(data.error.message);
        default:
      }
    }
  }
  return error;
}

/**
 * 解析 Gaxios 错误响应数据
 * 处理 Gaxios 偶尔不自动 JSON 化响应数据的情况
 * @param error - Gaxios 错误对象
 * @returns 解析后的响应数据
 */
function parseResponseData(error: GaxiosError): ResponseData {
  // Inexplicably, Gaxios sometimes doesn't JSONify the response data.
  if (typeof error.response?.data === 'string') {
    return JSON.parse(error.response?.data) as ResponseData;
  }
  return error.response?.data as ResponseData;
}
