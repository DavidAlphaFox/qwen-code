/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 安全地用字面字符串替换文本，避免 ECMAScript GetSubstitution 问题
 * 转义 $ 字符以防止模板解释
 * @param str - 原始字符串
 * @param oldString - 要替换的字符串
 * @param newString - 替换后的字符串
 * @returns 替换后的字符串
 */
export function safeLiteralReplace(
  str: string,
  oldString: string,
  newString: string,
): string {
  if (oldString === '' || !str.includes(oldString)) {
    return str;
  }

  if (!newString.includes('$')) {
    return str.replaceAll(oldString, newString);
  }

  const escapedNewString = newString.replaceAll('$', '$$$$');
  return str.replaceAll(oldString, escapedNewString);
}

/**
 * 通过测试 NULL 字节的存在来检查缓冲区是否可能是二进制数据
 * NULL 字节的存在是数据不是纯文本的强烈指示符
 * @param data - 要检查的缓冲区
 * @param sampleSize - 从缓冲区开头测试的字节数
 * @returns 如果找到 NULL 字节返回 true，否则返回 false
 */
export function isBinary(
  data: Buffer | null | undefined,
  sampleSize = 512,
): boolean {
  if (!data) {
    return false;
  }

  const sample = data.length > sampleSize ? data.subarray(0, sampleSize) : data;

  for (const byte of sample) {
    // The presence of a NULL byte (0x00) is one of the most reliable
    // indicators of a binary file. Text files should not contain them.
    if (byte === 0) {
      return true;
    }
  }

  // If no NULL bytes were found in the sample, we assume it's text.
  return false;
}

/**
 * 通过剥离 UTF-8 BOM 并将所有 CRLF (\r\n) 或单独的 CR (\r) 行尾转换为 LF (\n) 来规范化文本内容
 *
 * 这对于跨平台兼容性至关重要，特别是为了防止在 Windows 上解析失败
 * （Windows 上的文件可能以 CRLF 行尾保存）
 * @param content - 要规范化的原始文本内容
 * @returns 具有统一 \n 行尾的规范化字符串
 */
export function normalizeContent(content: string): string {
  // Strip UTF-8 BOM to ensure string processing starts at the first real character.
  let normalized = content.replace(/^\uFEFF/, '');

  // Normalize line endings to LF (\n).
  normalized = normalized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  return normalized;
}
