/**
 * 创建Query实例的工厂函数
 */

import type { SDKUserMessage } from '../types/protocol.js';
import { serializeJsonLine } from '../utils/jsonLines.js';
import { ProcessTransport } from '../transport/ProcessTransport.js';
import { prepareSpawnInfo, type SpawnInfo } from '../utils/cliPath.js';
import { Query } from './Query.js';
import type { QueryOptions } from '../types/types.js';
import { QueryOptionsSchema } from '../types/queryOptionsSchema.js';
import { SdkLogger } from '../utils/logger.js';
import { randomUUID } from 'node:crypto';
import { validateSessionId } from '../utils/validation.js';

export type { QueryOptions };

const logger = SdkLogger.createLogger('createQuery');

/**
 * 创建查询会话
 *
 * @param params - 查询参数
 * @returns Query实例
 */
export function query({
  prompt,
  options = {},
}: {
  /**
   * 发送到Qwen Code CLI进程的提示词
   * - 字符串类型用于单轮查询
   * - AsyncIterable<SDKUserMessage>用于多轮查询
   *
   * 传输层将保持打开状态直到查询完成
   */
  prompt: string | AsyncIterable<SDKUserMessage>;
  /**
   * 查询配置选项
   */
  options?: QueryOptions;
}): Query {
  const spawnInfo = validateOptions(options);

  const isSingleTurn = typeof prompt === 'string';

  const pathToQwenExecutable = options.pathToQwenExecutable;

  const abortController = options.abortController ?? new AbortController();

  // Generate or use provided session ID for SDK-CLI alignment
  const sessionId = options.resume ?? options.sessionId ?? randomUUID();

  const transport = new ProcessTransport({
    pathToQwenExecutable,
    spawnInfo,
    cwd: options.cwd,
    model: options.model,
    permissionMode: options.permissionMode,
    env: options.env,
    abortController,
    debug: options.debug,
    stderr: options.stderr,
    logLevel: options.logLevel,
    maxSessionTurns: options.maxSessionTurns,
    coreTools: options.coreTools,
    excludeTools: options.excludeTools,
    allowedTools: options.allowedTools,
    authType: options.authType,
    includePartialMessages: options.includePartialMessages,
    resume: options.resume,
    sessionId,
  });

  const queryOptions: QueryOptions = {
    ...options,
    abortController,
    sessionId,
  };

  const queryInstance = new Query(transport, queryOptions, isSingleTurn);

  if (isSingleTurn) {
    const stringPrompt = prompt as string;
    const message: SDKUserMessage = {
      type: 'user',
      session_id: queryInstance.getSessionId(),
      message: {
        role: 'user',
        content: stringPrompt,
      },
      parent_tool_use_id: null,
    };

    (async () => {
      try {
        await queryInstance.initialized;
        // Skip writing if transport has already exited with an error
        if (transport.exitError) {
          return;
        }
        transport.write(serializeJsonLine(message));
      } catch (err) {
        // Only log error if it's not due to transport already being closed
        if (!transport.exitError) {
          logger.error('Error sending single-turn prompt:', err);
        }
      }
    })();
  } else {
    queryInstance
      .streamInput(prompt as AsyncIterable<SDKUserMessage>)
      .catch((err) => {
        logger.error('Error streaming input:', err);
      });
  }

  return queryInstance;
}

/**
 * 验证查询选项
 * @param options - 查询选项
 * @returns SpawnInfo对象
 * @throws 如果选项无效则抛出错误
 */
function validateOptions(options: QueryOptions): SpawnInfo | undefined {
  const validationResult = QueryOptionsSchema.safeParse(options);
  if (!validationResult.success) {
    const errors = validationResult.error.errors
      .map((err) => `${err.path.join('.')}: ${err.message}`)
      .join('; ');
    throw new Error(`Invalid QueryOptions: ${errors}`);
  }

  // Validate sessionId format if provided
  if (options.sessionId) {
    validateSessionId(options.sessionId, 'sessionId');
  }

  // Validate resume format if provided
  if (options.resume) {
    validateSessionId(options.resume, 'resume');
  }

  try {
    return prepareSpawnInfo(options.pathToQwenExecutable);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid pathToQwenExecutable: ${errorMessage}`);
  }
}
