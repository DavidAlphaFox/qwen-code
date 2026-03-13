/**
 * MCP响应工具结果格式化工具模块
 *
 * 将各种输出类型转换为MCP内容块
 */

/**
 * MCP内容块联合类型
 */
export type McpContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'resource'; uri: string; mimeType?: string; text?: string };

/**
 * 工具结果接口
 */
export interface ToolResult {
  /** 内容块列表 */
  content: McpContentBlock[];
  /** 是否为错误 */
  isError?: boolean;
}

/**
 * 格式化工具结果为MCP格式
 * @param result - 要格式化的结果
 * @returns 格式化后的工具结果
 */
export function formatToolResult(result: unknown): ToolResult {
  // 处理Error对象
  if (result instanceof Error) {
    return {
      content: [
        {
          type: 'text',
          text: result.message || 'Unknown error',
        },
      ],
      isError: true,
    };
  }

  // 处理null/undefined
  if (result === null || result === undefined) {
    return {
      content: [
        {
          type: 'text',
          text: '',
        },
      ],
    };
  }

  // 处理字符串
  if (typeof result === 'string') {
    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  }

  // 处理数字
  if (typeof result === 'number') {
    return {
      content: [
        {
          type: 'text',
          text: String(result),
        },
      ],
    };
  }

  // 处理布尔值
  if (typeof result === 'boolean') {
    return {
      content: [
        {
          type: 'text',
          text: String(result),
        },
      ],
    };
  }

  // 处理对象（包括数组）
  if (typeof result === 'object') {
    try {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch {
      // JSON.stringify失败
      return {
        content: [
          {
            type: 'text',
            text: String(result),
          },
        ],
      };
    }
  }

  // 回退：转换为字符串
  return {
    content: [
      {
        type: 'text',
        text: String(result),
      },
    ],
  };
}

/**
 * 格式化工具错误为MCP格式
 * @param error - 错误对象或错误消息
 * @returns 格式化后的错误结果
 */
export function formatToolError(error: Error | string): ToolResult {
  const message = error instanceof Error ? error.message : error;

  return {
    content: [
      {
        type: 'text',
        text: message,
      },
    ],
    isError: true,
  };
}

/**
 * 格式化文本结果为MCP格式
 * @param text - 文本内容
 * @returns 格式化后的工具结果
 */
export function formatTextResult(text: string): ToolResult {
  return {
    content: [
      {
        type: 'text',
        text,
      },
    ],
  };
}

/**
 * 格式化JSON结果为MCP格式
 * @param data - 要格式化的数据
 * @returns 格式化后的工具结果
 */
export function formatJsonResult(data: unknown): ToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * 合并多个工具结果
 * @param results - 工具结果数组
 * @returns 合并后的工具结果
 */
export function mergeToolResults(results: ToolResult[]): ToolResult {
  const mergedContent: McpContentBlock[] = [];
  let hasError = false;

  for (const result of results) {
    mergedContent.push(...result.content);
    if (result.isError) {
      hasError = true;
    }
  }

  return {
    content: mergedContent,
    isError: hasError,
  };
}

/**
 * 验证内容块是否有效
 * @param block - 要验证的内容块
 * @returns 如果内容块有效返回true
 */
export function isValidContentBlock(block: unknown): block is McpContentBlock {
  if (!block || typeof block !== 'object') {
    return false;
  }

  const blockObj = block as Record<string, unknown>;

  if (!blockObj.type || typeof blockObj.type !== 'string') {
    return false;
  }

  switch (blockObj.type) {
    case 'text':
      return typeof blockObj.text === 'string';

    case 'image':
      return (
        typeof blockObj.data === 'string' &&
        typeof blockObj.mimeType === 'string'
      );

    case 'resource':
      return typeof blockObj.uri === 'string';

    default:
      return false;
  }
}
