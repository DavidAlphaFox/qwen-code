/**
 * UUID验证工具模块
 */

// UUID v4正则表达式
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * 验证字符串是否为有效的UUID格式
 * @param value - 要验证的字符串
 * @returns 如果是有效的UUID返回true，否则返回false
 */
export function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * 验证会话ID格式，如果无效则抛出错误
 * @param sessionId - 要验证的会话ID
 * @param paramName - 参数名称（用于错误消息）
 * @throws 如果会话ID不是有效的UUID则抛出错误
 */
export function validateSessionId(
  sessionId: string,
  paramName: string = 'sessionId',
): void {
  if (!isValidUUID(sessionId)) {
    throw new Error(
      `Invalid ${paramName}: "${sessionId}". Must be a valid UUID (e.g., "123e4567-e89b-12d3-a456-426614174000").`,
    );
  }
}
