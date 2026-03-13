/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import * as os from 'node:os';
import path from 'node:path';
import { canUseRipgrep } from '@qwen-code/qwen-code-core';

/** 警告检查选项 */
type WarningCheckOptions = {
  /** 工作区根目录 */
  workspaceRoot: string;
  /** 是否使用 ripgrep */
  useRipgrep: boolean;
  /** 是否使用内置 ripgrep */
  useBuiltinRipgrep: boolean;
};

/** 警告检查定义 */
type WarningCheck = {
  /** 检查 ID */
  id: string;
  /** 检查函数 */
  check: (options: WarningCheckOptions) => Promise<string | null>;
};

// 单独的警告检查

/** 主目录检查 */
const homeDirectoryCheck: WarningCheck = {
  id: 'home-directory',
  check: async (options: WarningCheckOptions) => {
    try {
      const [workspaceRealPath, homeRealPath] = await Promise.all([
        fs.realpath(options.workspaceRoot),
        fs.realpath(os.homedir()),
      ]);

      if (workspaceRealPath === homeRealPath) {
        return 'You are running Qwen Code in your home directory. It is recommended to run in a project-specific directory.';
      }
      return null;
    } catch (_err: unknown) {
      return 'Could not verify the current directory due to a file system error.';
    }
  },
};

/** 根目录检查 */
const rootDirectoryCheck: WarningCheck = {
  id: 'root-directory',
  check: async (options: WarningCheckOptions) => {
    try {
      const workspaceRealPath = await fs.realpath(options.workspaceRoot);
      const errorMessage =
        'Warning: You are running Qwen Code in the root directory. Your entire folder structure will be used for context. It is strongly recommended to run in a project-specific directory.';

      // 检查 Unix 根目录
      if (path.dirname(workspaceRealPath) === workspaceRealPath) {
        return errorMessage;
      }

      return null;
    } catch (_err: unknown) {
      return 'Could not verify the current directory due to a file system error.';
    }
  },
};

/** ripgrep 可用性检查 */
const ripgrepAvailabilityCheck: WarningCheck = {
  id: 'ripgrep-availability',
  check: async (options: WarningCheckOptions) => {
    if (!options.useRipgrep) {
      return null;
    }

    try {
      const isAvailable = await canUseRipgrep(options.useBuiltinRipgrep);
      if (!isAvailable) {
        return 'Ripgrep not available: Please install ripgrep globally to enable faster file content search. Falling back to built-in grep.';
      }
      return null;
    } catch (error) {
      return `Ripgrep not available: ${error instanceof Error ? error.message : 'Unknown error'}. Falling back to built-in grep.`;
    }
  },
};

// 所有警告检查
const WARNING_CHECKS: readonly WarningCheck[] = [
  homeDirectoryCheck,
  rootDirectoryCheck,
  ripgrepAvailabilityCheck,
];

/**
 * 获取用户启动警告
 * @param options - 警告检查选项
 * @returns Promise<string[]> 警告消息数组
 */
export async function getUserStartupWarnings(
  options: WarningCheckOptions,
): Promise<string[]> {
  const results = await Promise.all(
    WARNING_CHECKS.map((check) => check.check(options)),
  );
  return results.filter((msg) => msg !== null);
}
