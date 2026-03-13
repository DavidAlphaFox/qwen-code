/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 文件过滤选项接口
 */
export interface FileFilteringOptions {
  /** 是否尊重 .gitignore 文件 */
  respectGitIgnore: boolean;
  /** 是否尊重 .qwenignore 文件 */
  respectQwenIgnore: boolean;
}

// 内存文件的默认值
export const DEFAULT_MEMORY_FILE_FILTERING_OPTIONS: FileFilteringOptions = {
  respectGitIgnore: false,
  respectQwenIgnore: true,
};

// 其他所有文件的默认值
export const DEFAULT_FILE_FILTERING_OPTIONS: FileFilteringOptions = {
  respectGitIgnore: true,
  respectQwenIgnore: true,
};
