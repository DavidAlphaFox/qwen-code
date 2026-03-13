/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as crypto from 'node:crypto';
import type { Config } from '../config/config.js';
import { isNodeError } from './errors.js';

/**
 * Qwen 配置目录名称
 */
export const QWEN_DIR = '.qwen';
/**
 * Google 账户文件名
 */
export const GOOGLE_ACCOUNTS_FILENAME = 'google_accounts.json';

/**
 * 需要在文件路径中转义的 shell 特殊字符
 * 包括：空格、圆括号、方括号、大括号、分号、&、管道符、
 * 星号、问号、美元符号、反引号、引号、# 号和其他 shell 元字符
 * @example
 * const escaped = escapePath('my file.txt'); // 'my\ file.txt'
 */
export const SHELL_SPECIAL_CHARS = /[ \t()[\]{};|*?$`'"#&<>!~]/;

/**
 * 将路径中的主目录替换为波浪号 (~)
 * @param pathStr - 要转换的路径
 * @returns 替换后的路径，如果不在主目录下则返回原路径
 * @example
 * tildeifyPath('/home/user/documents/file.txt') // '~/documents/file.txt'
 */
export function tildeifyPath(pathStr: string): string {
  const homeDir = os.homedir();
  if (path.startsWith(homeDir)) {
    return path.replace(homeDir, '~');
  }
  return path;
}

/**
 * 缩短路径字符串，如果超过最大长度则优先保留开头和结尾部分
 * 当省略中间段时显示根目录 + 第一段 + "..." + 末尾段
 * @param filePath - 要缩短的文件路径
 * @param maxLen - 最大长度，默认为 80
 * @returns 缩短后的路径
 * @example
 * shortenPath('/path/to/a/very/long/file.txt', 30) // '/path/.../file.txt'
 */
export function shortenPath(filePath: string, maxLen: number = 80): string {
  if (filePath.length <= maxLen) {
    return filePath;
  }

  const separator = path.sep;
  const ellipsis = '...';

  // Simple fallback for very short maxLen
  if (maxLen < 10) {
    return filePath.substring(0, maxLen - 3) + ellipsis;
  }

  const parsedPath = path.parse(filePath);
  const root = parsedPath.root;
  const relativePath = filePath.substring(root.length);
  const segments = relativePath.split(separator).filter((s) => s !== '');

  // Handle edge cases: no segments or single segment
  if (segments.length === 0) {
    return root.length <= maxLen
      ? root
      : root.substring(0, maxLen - 3) + ellipsis;
  }

  if (segments.length === 1) {
    const full = root + segments[0];
    if (full.length <= maxLen) {
      return full;
    }
    const keepLen = Math.floor((maxLen - 3) / 2);
    const start = full.substring(0, keepLen);
    const end = full.substring(full.length - keepLen);
    return `${start}${ellipsis}${end}`;
  }

  // For 2+ segments: build from start and end, insert "..." if there's a gap
  const startPart = root + segments[0]; // Always include root and first segment

  // Collect segments from the end, working backwards
  const endSegments: string[] = [];

  for (let i = segments.length - 1; i >= 1; i--) {
    const segment = segments[i];

    // Calculate what the total would be if we add this segment
    const endPart = [segment, ...endSegments].join(separator);
    const needsEllipsis = i > 1; // If we're not at segment[1], there's a gap

    let candidateResult: string;
    if (needsEllipsis) {
      candidateResult = startPart + separator + ellipsis + separator + endPart;
    } else {
      candidateResult = startPart + separator + endPart;
    }

    if (candidateResult.length <= maxLen) {
      endSegments.unshift(segment);

      // If we've reached segment[1], we have all segments - return immediately
      if (i === 1) {
        return candidateResult;
      }
    } else {
      break; // Can't add more segments
    }
  }

  // Build final result
  if (endSegments.length === 0) {
    // Couldn't fit any end segments - use simple truncation
    const keepLen = Math.floor((maxLen - 3) / 2);
    const start = filePath.substring(0, keepLen);
    const end = filePath.substring(filePath.length - keepLen);
    return `${start}${ellipsis}${end}`;
  }

  // We have some end segments but not all - there's a gap, insert ellipsis
  return (
    startPart + separator + ellipsis + separator + endSegments.join(separator)
  );
}

/**
 * 计算从根目录到目标路径的相对路径
 * 在计算前会先解析两个路径
 * 如果目标路径与根目录相同则返回 '.'
 * @param targetPath - 要转为相对路径的目标路径（绝对或相对路径）
 * @param rootDirectory - 根目录的绝对路径
 * @returns 从根目录到目标路径的相对路径
 */
export function makeRelative(
  targetPath: string,
  rootDirectory: string,
): string {
  const resolvedTargetPath = path.resolve(targetPath);
  const resolvedRootDirectory = path.resolve(rootDirectory);

  if (!isSubpath(resolvedRootDirectory, resolvedTargetPath)) {
    return resolvedTargetPath;
  }

  const relativePath = path.relative(resolvedRootDirectory, resolvedTargetPath);

  // If the paths are the same, path.relative returns '', return '.' instead
  return relativePath || '.';
}

/**
 * 转义文件路径中的特殊字符，模拟 macOS 终端的行为
 * 转义：空格、圆括号、方括号、大括号、分号、&、管道符、
 * 星号、问号、美元符号、反引号、引号、# 号和其他 shell 元字符
 * @param filePath - 要转义的文件路径
 * @returns 转义后的文件路径
 */
export function escapePath(filePath: string): string {
  let result = '';
  for (let i = 0; i < filePath.length; i++) {
    const char = filePath[i];

    // Count consecutive backslashes before this character
    let backslashCount = 0;
    for (let j = i - 1; j >= 0 && filePath[j] === '\\'; j--) {
      backslashCount++;
    }

    // Character is already escaped if there's an odd number of backslashes before it
    const isAlreadyEscaped = backslashCount % 2 === 1;

    // Only escape if not already escaped
    if (!isAlreadyEscaped && SHELL_SPECIAL_CHARS.test(char)) {
      result += '\\' + char;
    } else {
      result += char;
    }
  }
  return result;
}

/**
 * 取消转义文件路径中的特殊字符
 * 移除 shell 元字符的反斜杠转义
 * @param filePath - 要取消转义的文件路径
 * @returns 取消转义后的文件路径
 */
export function unescapePath(filePath: string): string {
  return filePath.replace(
    new RegExp(`\\\\([${SHELL_SPECIAL_CHARS.source.slice(1, -1)}])`, 'g'),
    '$1',
  );
}

/**
 * 根据项目根路径生成唯一的项目哈希值
 * 在 Windows 上路径不区分大小写，因此会转换为小写以确保相同物理路径始终产生相同的哈希
 * @param projectRoot - 项目根目录的绝对路径
 * @returns 项目根路径的 SHA256 哈希值
 */
export function getProjectHash(projectRoot: string): string {
  // On Windows, normalize path to lowercase for case-insensitive matching
  const normalizedPath =
    os.platform() === 'win32' ? projectRoot.toLowerCase() : projectRoot;
  return crypto.createHash('sha256').update(normalizedPath).digest('hex');
}

/**
 * 清理目录路径以创建安全的项目 ID
 * - 在 Windows 上：规范化为小写以实现不区分大小写的匹配
 * - 将所有非字母数字字符替换为连字符
 * 用于：
 * - 创建项目特定的目录
 * - 生成调试日志的会话 ID
 * @param cwd - 要清理的目录路径
 * @returns 可用作项目标识符的安全字符串
 */
export function sanitizeCwd(cwd: string): string {
  // On Windows, normalize to lowercase for case-insensitive matching
  const normalizedCwd = os.platform() === 'win32' ? cwd.toLowerCase() : cwd;
  return normalizedCwd.replace(/[^a-zA-Z0-9]/g, '-');
}

/**
 * 检查路径是否是另一个路径的子路径
 * @param parentPath - 父路径
 * @param childPath - 子路径
 * @returns 如果 childPath 是 parentPath 的子路径返回 true，否则返回 false
 */
export function isSubpath(parentPath: string, childPath: string): boolean {
  const isWindows = os.platform() === 'win32';
  const pathModule = isWindows ? path.win32 : path;

  // On Windows, path.relative is case-insensitive. On POSIX, it's case-sensitive.
  const relative = pathModule.relative(parentPath, childPath);

  return (
    !relative.startsWith(`..${pathModule.sep}`) &&
    relative !== '..' &&
    !pathModule.isAbsolute(relative)
  );
}

/**
 * 解析路径，支持波浪号 (~) 展开和相对路径解析
 * 处理主目录的波浪号展开，并根据提供的基准目录或当前工作目录解析相对路径
 * @param baseDir - 解析相对路径的基准目录（默认为当前工作目录）
 * @param relativePath - 要解析的路径（可以是相对路径、绝对路径或以波浪号开头的路径）
 * @returns 解析后的绝对路径
 */
export function resolvePath(
  baseDir: string | undefined = process.cwd(),
  relativePath: string,
): string {
  const homeDir = os.homedir();

  if (relativePath === '~') {
    return homeDir;
  } else if (relativePath.startsWith('~/')) {
    return path.join(homeDir, relativePath.slice(2));
  } else if (path.isAbsolute(relativePath)) {
    return relativePath;
  } else {
    return path.resolve(baseDir, relativePath);
  }
}

/**
 * 路径验证选项
 */
export interface PathValidationOptions {
  /**
   * 如果为 true，允许文件和目录。如果为 false（默认），仅允许目录
   */
  allowFiles?: boolean;
}

/**
 * 验证解析后的路径是否在工作区边界内
 * @param config - 包含工作区上下文的配置对象
 * @param resolvedPath - 要验证的绝对路径
 * @param options - 验证选项
 * @throws 如果路径在工作区边界之外、不存在或不是目录（当 allowFiles 为 false 时）则抛出错误
 */
export function validatePath(
  config: Config,
  resolvedPath: string,
  options: PathValidationOptions = {},
): void {
  const { allowFiles = false } = options;
  const workspaceContext = config.getWorkspaceContext();

  if (!workspaceContext.isPathWithinWorkspace(resolvedPath)) {
    throw new Error('Path is not within workspace');
  }

  try {
    const stats = fs.statSync(resolvedPath);
    if (!allowFiles && !stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${resolvedPath}`);
    }
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      throw new Error(`Path does not exist: ${resolvedPath}`);
    }
    throw error;
  }
}

/**
 * 解析相对于工作区根目录的路径，并验证它是否在工作区边界内
 * @param config - 配置对象
 * @param relativePath - 要解析的相对路径（可选，默认为目标目录）
 * @param options - 验证选项（例如，允许文件路径的 allowFiles）
 * @returns 解析并验证后的绝对路径
 */
export function resolveAndValidatePath(
  config: Config,
  relativePath?: string,
  options: PathValidationOptions = {},
): string {
  const targetDir = config.getTargetDir();

  if (!relativePath) {
    return targetDir;
  }

  const resolvedPath = resolvePath(targetDir, relativePath);
  validatePath(config, resolvedPath, options);
  return resolvedPath;
}
