/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 文件系统测试助手模块
 * 提供用于创建和管理测试用临时文件系统的工具函数。
 * @module
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

/**
 * 定义测试用虚拟文件系统的结构。
 * 键是文件或目录名称，值可以是：
 * - 字符串：文件内容
 * - FileSystemStructure 对象：表示具有自身结构的子目录
 * - 字符串或 FileSystemStructure 对象数组：表示目录，
 *   其中字符串是空文件，对象是子目录
 *
 * @example
 * // 示例1：简单文件和目录
 * const structure1 = {
 *   'file1.txt': 'Hello, world!',
 *   'empty-dir': [],
 *   'src': {
 *     'main.js': '// Main application file',
 *     'utils.ts': '// Utility functions',
 *   },
 * };
 *
 * @example
 * // 示例2：嵌套目录和数组中的空文件
 * const structure2 = {
 *   'config.json': '{ "port": 3000 }',
 *   'data': [
 *     'users.csv',
 *     'products.json',
 *     {
 *       'logs': [
 *         'error.log',
 *         'access.log',
 *       ],
 *     },
 *   ],
 * };
 */
export type FileSystemStructure = {
  [name: string]:
    | string
    | FileSystemStructure
    | Array<string | FileSystemStructure>;
};

/**
 * 根据提供的 FileSystemStructure 递归创建文件和目录。
 * @param dir 基础目录，结构将在此目录下创建
 * @param structure 定义文件和目录的 FileSystemStructure
 */
async function create(dir: string, structure: FileSystemStructure) {
  for (const [name, content] of Object.entries(structure)) {
    const newPath = path.join(dir, name);
    if (typeof content === 'string') {
      await fs.writeFile(newPath, content);
    } else if (Array.isArray(content)) {
      await fs.mkdir(newPath, { recursive: true });
      for (const item of content) {
        if (typeof item === 'string') {
          await fs.writeFile(path.join(newPath, item), '');
        } else {
          await create(newPath, item as FileSystemStructure);
        }
      }
    } else if (typeof content === 'object' && content !== null) {
      await fs.mkdir(newPath, { recursive: true });
      await create(newPath, content as FileSystemStructure);
    }
  }
}

/**
 * 创建一个临时目录并在其中填充给定的文件系统结构。
 * @param structure 要在临时目录内创建的 FileSystemStructure
 * @returns 一个 Promise resolves 为创建的临时目录的绝对路径
 */
export async function createTmpDir(
  structure: FileSystemStructure,
): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-cli-test-'));
  await create(tmpDir, structure);
  return tmpDir;
}

/**
 * 清理（删除）临时目录及其内容。
 * @param dir 要清理的临时目录的绝对路径
 */
export async function cleanupTmpDir(dir: string) {
  await fs.rm(dir, { recursive: true, force: true });
}
