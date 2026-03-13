/**
 * 终止错误类
 * 当操作被用户主动中止时抛出此错误
 */
export class AbortError extends Error {
  /**
   * 创建一个终止错误实例
   * @param message - 错误消息，默认值为 "Operation aborted"
   */
  constructor(message = 'Operation aborted') {
    super(message);
    this.name = 'AbortError';
    Object.setPrototypeOf(this, AbortError.prototype);
  }
}

/**
 * 判断错误是否为终止错误
 * @param error - 要检查的错误对象
 * @returns 如果错误是终止错误返回 true，否则返回 false
 */
export function isAbortError(error: unknown): error is AbortError {
  return (
    error instanceof AbortError ||
    (typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      error.name === 'AbortError')
  );
}
