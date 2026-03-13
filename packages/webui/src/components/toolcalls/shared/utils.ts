/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * 工具调用组件共享工具函数
 * 平台无关的工具函数，可在不同平台间使用
 */

import type {
  ToolCallContent,
  GroupedContent,
  ToolCallData,
  ToolCallStatus,
  ContainerStatus,
} from './types.js';

/**
 * 从命令执行结果文本中提取输出
 * 处理JSON格式和结构化文本格式
 *
 * 结构化文本示例：
 * ```
 * Command: lsof -i :5173
 * Directory: (root)
 * Output: COMMAND   PID    USER...
 * Error: (none)
 * Exit Code: 0
 * ```
 *
 * @param {string} text - 命令执行结果文本
 * @returns {string} 提取后的输出内容
 */
export const extractCommandOutput = (text: string): string => {
  // First try: Parse as JSON and extract output field
  try {
    const parsed = JSON.parse(text) as { output?: unknown; Output?: unknown };
    const output = parsed.output ?? parsed.Output;
    if (output !== undefined && output !== null) {
      return typeof output === 'string'
        ? output
        : JSON.stringify(output, null, 2);
    }
  } catch (_error) {
    // Not JSON, continue with text parsing
  }

  // Second try: Extract from structured text format
  const outputMatch = text.match(
    /Output:[ \t]{0,20}(.{0,1000}?)(?=\nError:|$)/i,
  );
  if (outputMatch && outputMatch[1]) {
    const output = outputMatch[1].trim();
    if (output && output !== '(none)' && output.length > 0) {
      return output;
    }
  }

  // Third try: Check if text starts with structured format
  if (text.match(/^Command:/)) {
    const lines = text.split('\n');
    const outputLines: string[] = [];
    let inOutput = false;

    for (const line of lines) {
      if (
        line.startsWith('Error:') ||
        line.startsWith('Exit Code:') ||
        line.startsWith('Signal:') ||
        line.startsWith('Background PIDs:') ||
        line.startsWith('Process Group PGID:')
      ) {
        break;
      }
      if (line.startsWith('Command:') || line.startsWith('Directory:')) {
        continue;
      }
      if (line.startsWith('Output:')) {
        inOutput = true;
        const content = line.substring('Output:'.length).trim();
        if (content && content !== '(none)') {
          outputLines.push(content);
        }
        continue;
      }
      if (
        inOutput ||
        (!line.startsWith('Command:') && !line.startsWith('Directory:'))
      ) {
        outputLines.push(line);
      }
    }

    if (outputLines.length > 0) {
      const result = outputLines.join('\n').trim();
      if (result && result !== '(none)') {
        return result;
      }
    }
  }

  // Fallback: Return original text
  return text;
};

/**
 * 格式化任意值为字符串用于显示
 * @param {unknown} value - 要格式化的值
 * @returns {string} 格式化后的字符串
 */
export const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return extractCommandOutput(value);
  }
  if (value instanceof Error) {
    return value.message || value.toString();
  }
  if (typeof value === 'object' && value !== null && 'message' in value) {
    const errorObj = value as { message?: string; stack?: string };
    return errorObj.message || String(value);
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch (_e) {
      return String(value);
    }
  }
  return String(value);
};

/**
 * 安全地将标题转换为字符串，处理对象类型
 * 如果没有有意义的标题则返回空字符串
 * 使用 try/catch 安全处理循环引用
 * @param {unknown} title - 标题值
 * @returns {string} 转换后的字符串
 */
export const safeTitle = (title: unknown): string => {
  if (typeof title === 'string' && title.trim()) {
    return title;
  }
  if (title && typeof title === 'object') {
    try {
      return JSON.stringify(title);
    } catch (_e) {
      // Handle circular references or BigInt
      return String(title);
    }
  }
  return '';
};

/**
 * 检查是否应该显示工具调用
 * 隐藏内部工具调用
 * @param {string} kind - 工具类型
 * @returns {boolean} 是否应该显示
 */
export const shouldShowToolCall = (kind: string): boolean =>
  !kind.includes('internal');

/**
 * 按类型分组工具调用内容以避免重复标签
 * 错误检测逻辑：
 * - 如果 contentObj.error 已设置（不为 null/undefined），则视为错误
 * - 如果 contentObj.type === 'error' 且有内容（text 或 error），则视为错误
 * 这可以避免空错误标记的误报，同时不遗漏真实错误
 * @param {ToolCallContent[] | undefined} content - 工具调用内容列表
 * @returns {GroupedContent} 分组后的内容
 */
export const groupContent = (content?: ToolCallContent[]): GroupedContent => {
  const textOutputs: string[] = [];
  const errors: string[] = [];
  const diffs: ToolCallContent[] = [];
  const otherData: unknown[] = [];

  content?.forEach((item) => {
    if (item.type === 'diff') {
      diffs.push(item);
    } else if (item.content) {
      const contentObj = item.content;

      // Determine if this is an error:
      // 1. error field is explicitly set (not null/undefined)
      // 2. type is 'error' AND has actual content (text or error field)
      const hasErrorField = contentObj.error != null;
      const isErrorType =
        contentObj.type === 'error' &&
        (contentObj.text != null || contentObj.error != null);
      const hasError = hasErrorField || isErrorType;

      if (hasError) {
        let errorMsg = '';

        if (typeof contentObj.error === 'string') {
          errorMsg = contentObj.error;
        } else if (
          contentObj.error &&
          typeof contentObj.error === 'object' &&
          'message' in contentObj.error
        ) {
          errorMsg = (contentObj.error as { message: string }).message;
        } else if (contentObj.text) {
          errorMsg = formatValue(contentObj.text);
        } else if (contentObj.error) {
          errorMsg = formatValue(contentObj.error);
        } else {
          errorMsg = 'An error occurred';
        }

        errors.push(errorMsg);
      } else if (contentObj.text) {
        textOutputs.push(formatValue(contentObj.text));
      } else {
        otherData.push(contentObj);
      }
    }
  });

  return { textOutputs, errors, diffs, otherData };
};

/**
 * 检查工具调用是否有实际输出需要显示
 * 对于成功完成但没有可见输出的工具调用返回 false
 * @param {ToolCallData} toolCall - 工具调用数据
 * @returns {boolean} 是否有输出
 */
export const hasToolCallOutput = (toolCall: ToolCallData): boolean => {
  if (toolCall.status === 'failed') {
    return true;
  }

  const kind = toolCall.kind.toLowerCase();
  if (kind === 'execute' || kind === 'bash' || kind === 'command') {
    if (
      toolCall.title &&
      typeof toolCall.title === 'string' &&
      toolCall.title.trim()
    ) {
      return true;
    }
  }

  if (toolCall.locations && toolCall.locations.length > 0) {
    return true;
  }

  if (toolCall.content && toolCall.content.length > 0) {
    const grouped = groupContent(toolCall.content);
    if (
      grouped.textOutputs.length > 0 ||
      grouped.errors.length > 0 ||
      grouped.diffs.length > 0 ||
      grouped.otherData.length > 0
    ) {
      return true;
    }
  }

  if (
    toolCall.title &&
    typeof toolCall.title === 'string' &&
    toolCall.title.trim()
  ) {
    return true;
  }

  return false;
};

/**
 * 将工具调用状态映射到容器状态（子弹颜色）
 * - pending/in_progress -> loading
 * - completed -> success
 * - failed -> error
 * - default fallback
 * @param {ToolCallStatus} status - 工具调用状态
 * @returns {ContainerStatus} 容器状态
 */
export const mapToolStatusToContainerStatus = (
  status: ToolCallStatus,
): ContainerStatus => {
  switch (status) {
    case 'pending':
    case 'in_progress':
      return 'loading';
    case 'failed':
      return 'error';
    case 'completed':
      return 'success';
    default:
      return 'default';
  }
};
