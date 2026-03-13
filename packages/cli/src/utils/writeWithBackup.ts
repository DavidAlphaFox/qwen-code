/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';

/**
 * writeWithBackup 函数的选项
 */
export interface WriteWithBackupOptions {
  /** 备份文件后缀（默认：'.orig'） */
  backupSuffix?: string;
  /** 文件编码（默认：'utf-8'） */
  encoding?: BufferEncoding;
}

/**
 * 安全地写入文件并提供备份保护
 * 此函数通过以下方式确保数据安全：
 * 1. 首先将内容写入临时文件
 * 2. 备份现有目标文件（如果有）
 * 3. 将临时文件重命名为目标路径
 * 如果任何步骤失败，会抛出错误并且磁盘上不会留下部分更改
 * 备份文件（如果创建）可以用于手动恢复
 * 注意：这不是 100% 原子的，但提供了良好的保护。在最坏的情况下，
 * .orig 备份文件仍然存在，可以手动恢复
 * @param targetPath - 要写入的路径
 * @param content - 要写入的内容
 * @param options - 可选配置
 * @throws Error 如果写入过程的任何步骤失败
 * @example
 * ```typescript
 * await writeWithBackup('/path/to/settings.json', JSON.stringify(settings, null, 2));
 * // 如果 /path/to/settings.json 存在，它现在已备份到 /path/to/settings.json.orig
 * ```
 */
export async function writeWithBackup(
  targetPath: string,
  content: string,
  options: WriteWithBackupOptions = {},
): Promise<void> {
  // 异步版本委托给同步版本，因为文件操作是同步的
  writeWithBackupSync(targetPath, content, options);
}

/**
 * writeWithBackup 的同步版本
 * @param targetPath - 要写入的路径
 * @param content - 要写入的内容
 * @param options - 可选配置
 * @throws Error 如果写入过程的任何步骤失败
 */
export function writeWithBackupSync(
  targetPath: string,
  content: string,
  options: WriteWithBackupOptions = {},
): void {
  const { backupSuffix = '.orig', encoding = 'utf-8' } = options;
  const tempPath = `${targetPath}.tmp`;
  const backupPath = `${targetPath}${backupSuffix}`;

  // 清理之前失败尝试留下的任何临时文件
  try {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  } catch (_e) {
    // 忽略清理错误
  }

  try {
    // 步骤 1：写入临时文件
    fs.writeFileSync(tempPath, content, { encoding });

    // 步骤 2：如果目标存在，则备份
    if (fs.existsSync(targetPath)) {
      // 检查目标是否是目录 - 我们不能写入目录
      const targetStat = fs.statSync(targetPath);
      if (targetStat.isDirectory()) {
        // 在抛出之前清理临时文件
        try {
          fs.unlinkSync(tempPath);
        } catch (_e) {
          // 忽略清理错误
        }
        throw new Error(
          `Cannot write to '${targetPath}' because it is a directory`,
        );
      }

      try {
        fs.renameSync(targetPath, backupPath);
      } catch (backupError) {
        // 在抛出之前清理临时文件
        try {
          fs.unlinkSync(tempPath);
        } catch (_e) {
          // 忽略清理错误
        }
        throw new Error(
          `Failed to backup existing file: ${backupError instanceof Error ? backupError.message : String(backupError)}`,
        );
      }
    }

    // 步骤 3：将临时文件重命名为目标
    try {
      fs.renameSync(tempPath, targetPath);
    } catch (renameError) {
      let restoreFailedMessage: string | undefined;
      let backupExisted = false;

      // 如果重命名失败，尝试恢复备份
      if (fs.existsSync(backupPath)) {
        backupExisted = true;
        try {
          fs.renameSync(backupPath, targetPath);
        } catch (restoreError) {
          restoreFailedMessage =
            restoreError instanceof Error
              ? restoreError.message
              : String(restoreError);
        }
      }

      const writeFailureMessage =
        renameError instanceof Error
          ? renameError.message
          : String(renameError);

      if (restoreFailedMessage) {
        throw new Error(
          `Failed to write file: ${writeFailureMessage}. ` +
            `Automatic restore failed: ${restoreFailedMessage}. ` +
            `Manual recovery may be required using backup file '${backupPath}'.`,
        );
      }

      if (backupExisted) {
        throw new Error(
          `Failed to write file: ${writeFailureMessage}. ` +
            `Target was automatically restored from backup '${backupPath}'.`,
        );
      }

      throw new Error(
        `Failed to write file: ${writeFailureMessage}. No backup file was available for restoration.`,
      );
    }
  } catch (error) {
    // 确保任何错误时清理临时文件
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch (_e) {
      // 忽略清理错误
    }
    throw error;
  }
}
