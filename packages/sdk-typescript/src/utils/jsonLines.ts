import { SdkLogger } from './logger.js';

/**
 * 将消息序列化为JSON Lines格式
 * @param message - 要序列化的消息对象
 * @returns 序列化后的JSON Lines字符串
 */
export function serializeJsonLine(message: unknown): string {
  try {
    return JSON.stringify(message) + '\n';
  } catch (error) {
    throw new Error(
      `Failed to serialize message to JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * 安全解析单行JSON
 * @param line - 要解析的行
 * @param context - 日志上下文
 * @returns 解析后的对象，解析失败返回null
 */
export function parseJsonLineSafe(
  line: string,
  context = 'JsonLines',
): unknown | null {
  const logger = SdkLogger.createLogger(context);
  try {
    return JSON.parse(line);
  } catch (error) {
    logger.warn(
      'Failed to parse JSON line, skipping:',
      line.substring(0, 100),
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

/**
 * 检查消息是否有效
 * @param message - 要检查的消息对象
 * @returns 如果消息有效返回true
 */
export function isValidMessage(message: unknown): boolean {
  return (
    message !== null &&
    typeof message === 'object' &&
    'type' in message &&
    typeof (message as { type: unknown }).type === 'string'
  );
}

/**
 * 异步解析JSON Lines流
 * @param lines - 异步行迭代器
 * @param context - 日志上下文
 * @yield 解析后的消息对象
 */
export async function* parseJsonLinesStream(
  lines: AsyncIterable<string>,
  context = 'JsonLines',
): AsyncGenerator<unknown, void, unknown> {
  const logger = SdkLogger.createLogger(context);
  for await (const line of lines) {
    if (line.trim().length === 0) {
      continue;
    }

    const message = parseJsonLineSafe(line, context);

    if (message === null) {
      continue;
    }

    if (!isValidMessage(message)) {
      logger.warn(
        "Invalid message structure (missing 'type' field), skipping:",
        line.substring(0, 100),
      );
      continue;
    }

    yield message;
  }
}
