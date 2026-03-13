/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 计算 Qwen Code 应用程序的窗口标题
 * @param folderName - 当前文件夹/工作区的名称，用于显示在标题中
 * @returns string 计算后的窗口标题，如果设置了 CLI_TITLE 环境变量则使用该值，否则使用默认的 Qwen 标题
 */
export function computeWindowTitle(folderName: string): string {
  const title = process.env['CLI_TITLE'] || `Qwen - ${folderName}`;

  // 移除可能导致终端标题问题的控制字符
  return title.replace(
    // eslint-disable-next-line no-control-regex
    /[\x00-\x1F\x7F]/g,
    '',
  );
}
