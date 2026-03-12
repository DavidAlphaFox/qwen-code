/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { isSubpath } from '../utils/paths.js';
import type { Config } from '../config/config.js';
import { DEFAULT_FILE_FILTERING_OPTIONS } from '../config/constants.js';
import { ToolErrorType } from './tool-error.js';
import { ToolDisplayNames, ToolNames } from './tool-names.js';
import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('LS');

const MAX_ENTRY_COUNT = 100;

/**
 * LS 工具模块
 *
 * 该模块实现了列出目录内容的功能，可以显示指定路径下的文件和子目录。
 * 支持过滤功能，可以忽略符合特定模式的文件，并支持 .gitignore 和 .qwenignore 文件过滤规则。
 */

/**
 * Parameters for the LS tool
 * LS 工具的参数
 */
export interface LSToolParams {
  /**
   * The absolute path to the directory to list
   * 要列出的目录的绝对路径
   */
  path: string;

  /**
   * Array of glob patterns to ignore (optional)
   * 要忽略的 glob 模式数组（可选）
   */
  ignore?: string[];

  /**
   * Whether to respect .gitignore and .qwenignore patterns (optional, defaults to true)
   * 是否遵守 .gitignore 和 .qwenignore 模式（可选，默认为 true）
   */
  file_filtering_options?: {
    respect_git_ignore?: boolean;
    respect_qwen_ignore?: boolean;
  };
}

/**
 * File entry returned by LS tool
 * LS 工具返回的文件条目
 */
export interface FileEntry {
  /**
   * Name of the file or directory
   * 文件或目录的名称
   */
  name: string;

  /**
   * Absolute path to the file or directory
   * 文件或目录的绝对路径
   */
  path: string;

  /**
   * Whether this entry is a directory
   * 该条目是否为目录
   */
  isDirectory: boolean;

  /**
   * Size of the file in bytes (0 for directories)
   * 文件大小（字节，目录为 0）
   */
  size: number;

  /**
   * Last modified timestamp
   * 最后修改时间戳
   */
  modifiedTime: Date;
}

class LSToolInvocation extends BaseToolInvocation<LSToolParams, ToolResult> {
  constructor(
    private readonly config: Config,
    params: LSToolParams,
  ) {
    super(params);
  }

  /**
   * Checks if a filename matches any of the ignore patterns
   * 检查文件名是否匹配任何忽略模式
   * @param filename Filename to check\n要检查的文件名
   * @param patterns Array of glob patterns to check against\n要检查的 glob 模式数组
   * @returns True if the filename should be ignored\n如果文件名应该被忽略则返回 true
   */
  private shouldIgnore(filename: string, patterns?: string[]): boolean {
    if (!patterns || patterns.length === 0) {
      return false;
    }
    for (const pattern of patterns) {
      // Convert glob pattern to RegExp
      const regexPattern = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      const regex = new RegExp(`^${regexPattern}$`);
      if (regex.test(filename)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Gets a description of the file reading operation
   * 获取文件读取操作的描述
   * @returns A string describing the file being read\n描述正在读取的文件的字符串
   */
  getDescription(): string {
    const relativePath = makeRelative(
      this.params.path,
      this.config.getTargetDir(),
    );
    return shortenPath(relativePath);
  }

  // Helper for consistent error formatting
  // 用于一致错误格式化的辅助方法
  private errorResult(
    llmContent: string,
    returnDisplay: string,
    type: ToolErrorType,
  ): ToolResult {
    return {
      llmContent,
      // Keep returnDisplay simpler in core logic
      returnDisplay: `Error: ${returnDisplay}`,
      error: {
        message: llmContent,
        type,
      },
    };
  }

  /**
   * Executes the LS operation with the given parameters
   * 使用给定参数执行 LS 操作
   * @returns Result of the LS operation\nLS 操作的结果
   */
  async execute(_signal: AbortSignal): Promise<ToolResult> {
    try {
      const stats = await fs.stat(this.params.path);
      if (!stats) {
        // fs.statSync throws on non-existence, so this check might be redundant
        // but keeping for clarity. Error message adjusted.
        return this.errorResult(
          `Error: Directory not found or inaccessible: ${this.params.path}`,
          `Directory not found or inaccessible.`,
          ToolErrorType.FILE_NOT_FOUND,
        );
      }
      if (!stats.isDirectory()) {
        return this.errorResult(
          `Error: Path is not a directory: ${this.params.path}`,
          `Path is not a directory.`,
          ToolErrorType.PATH_IS_NOT_A_DIRECTORY,
        );
      }

      const files = await fs.readdir(this.params.path);
      if (files.length === 0) {
        // Changed error message to be more neutral for LLM
        return {
          llmContent: `Directory ${this.params.path} is empty.`,
          returnDisplay: `Directory is empty.`,
        };
      }

      const relativePaths = files.map((file) =>
        path.relative(
          this.config.getTargetDir(),
          path.join(this.params.path, file),
        ),
      );

      const fileDiscovery = this.config.getFileService();
      const { filteredPaths, gitIgnoredCount, qwenIgnoredCount } =
        fileDiscovery.filterFilesWithReport(relativePaths, {
          respectGitIgnore:
            this.params.file_filtering_options?.respect_git_ignore ??
            this.config.getFileFilteringOptions().respectGitIgnore ??
            DEFAULT_FILE_FILTERING_OPTIONS.respectGitIgnore,
          respectQwenIgnore:
            this.params.file_filtering_options?.respect_qwen_ignore ??
            this.config.getFileFilteringOptions().respectQwenIgnore ??
            DEFAULT_FILE_FILTERING_OPTIONS.respectQwenIgnore,
        });

      const entries = [];
      for (const relativePath of filteredPaths) {
        const fullPath = path.resolve(this.config.getTargetDir(), relativePath);

        if (this.shouldIgnore(path.basename(fullPath), this.params.ignore)) {
          continue;
        }

        try {
          const stats = await fs.stat(fullPath);
          const isDir = stats.isDirectory();
          entries.push({
            name: path.basename(fullPath),
            path: fullPath,
            isDirectory: isDir,
            size: isDir ? 0 : stats.size,
            modifiedTime: stats.mtime,
          });
        } catch (error) {
          // Log error internally but don't fail the whole listing
          debugLogger.warn(`Error accessing ${fullPath}: ${error}`);
        }
      }

      // Sort entries (directories first, then alphabetically)
      entries.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

      const totalEntryCount = entries.length;
      const entryLimit = Math.min(
        MAX_ENTRY_COUNT,
        this.config.getTruncateToolOutputLines(),
      );
      const truncated = totalEntryCount > entryLimit;

      const entriesToShow = truncated ? entries.slice(0, entryLimit) : entries;

      const directoryContent = entriesToShow
        .map((entry) => `${entry.isDirectory ? '[DIR] ' : ''}${entry.name}`)
        .join('\n');

      let resultMessage = `Listed ${totalEntryCount} item(s) in ${this.params.path}:\n---\n${directoryContent}`;

      if (truncated) {
        const omittedEntries = totalEntryCount - entryLimit;
        const entryTerm = omittedEntries === 1 ? 'item' : 'items';
        resultMessage += `\n---\n[${omittedEntries} ${entryTerm} truncated] ...`;
      }

      const ignoredMessages = [];
      if (gitIgnoredCount > 0) {
        ignoredMessages.push(`${gitIgnoredCount} git-ignored`);
      }
      if (qwenIgnoredCount > 0) {
        ignoredMessages.push(`${qwenIgnoredCount} qwen-ignored`);
      }
      if (ignoredMessages.length > 0) {
        resultMessage += `\n\n(${ignoredMessages.join(', ')})`;
      }

      let displayMessage = `Listed ${totalEntryCount} item(s)`;
      if (ignoredMessages.length > 0) {
        displayMessage += ` (${ignoredMessages.join(', ')})`;
      }
      if (truncated) {
        displayMessage += ' (truncated)';
      }

      return {
        llmContent: resultMessage,
        returnDisplay: displayMessage,
      };
    } catch (error) {
      const errorMsg = `Error listing directory: ${error instanceof Error ? error.message : String(error)}`;
      return this.errorResult(
        errorMsg,
        'Failed to list directory.',
        ToolErrorType.LS_EXECUTION_ERROR,
      );
    }
  }
}

/**
 * Implementation of the LS tool logic
 * LS 工具逻辑的实现
 */
export class LSTool extends BaseDeclarativeTool<LSToolParams, ToolResult> {
  static readonly Name = ToolNames.LS;

  constructor(private config: Config) {
    super(
      LSTool.Name,
      ToolDisplayNames.LS,
      'Lists the names of files and subdirectories directly within a specified directory path. Can optionally ignore entries matching provided glob patterns.\n列出指定目录路径中的文件和子目录名称。可以选择忽略符合指定 glob 模式的条目。',
      Kind.Search,
      {
        properties: {
          path: {
            description:
              'The absolute path to the directory to list (must be absolute, not relative)\n要列出的目录的绝对路径（必须是绝对路径，不能是相对路径）',
            type: 'string',
          },
          ignore: {
            description:
              'List of glob patterns to ignore\n要忽略的 glob 模式列表',
            items: {
              type: 'string',
            },
            type: 'array',
          },
          file_filtering_options: {
            description:
              'Optional: Whether to respect ignore patterns from .gitignore or .qwenignore\n可选：是否遵守 .gitignore 或 .qwenignore 中的忽略模式',
            type: 'object',
            properties: {
              respect_git_ignore: {
                description:
                  'Optional: Whether to respect .gitignore patterns when listing files. Only available in git repositories. Defaults to true.\n可选：列出文件时是否遵守 .gitignore 模式。仅在 git 仓库中可用。默认为 true。',
                type: 'boolean',
              },
              respect_qwen_ignore: {
                description:
                  'Optional: Whether to respect .qwenignore patterns when listing files. Defaults to true.\n可选：列出文件时是否遵守 .qwenignore 模式。默认为 true。',
                type: 'boolean',
              },
            },
          },
        },
        required: ['path'],
        type: 'object',
      },
    );
  }

  /**
   * Validates the parameters for the tool
   * 验证工具的参数
   * @param params Parameters to validate\n要验证的参数
   * @returns An error message string if invalid, null otherwise\n如果参数无效则返回错误消息字符串，否则返回 null
   */
  protected override validateToolParamValues(
    params: LSToolParams,
  ): string | null {
    if (!path.isAbsolute(params.path)) {
      return `Path must be absolute: ${params.path}`;
    }

    const userSkillsBase = this.config.storage.getUserSkillsDir();
    const isUnderUserSkills = isSubpath(userSkillsBase, params.path);

    const workspaceContext = this.config.getWorkspaceContext();
    if (
      !workspaceContext.isPathWithinWorkspace(params.path) &&
      !isUnderUserSkills
    ) {
      const directories = workspaceContext.getDirectories();
      return `Path must be within one of the workspace directories: ${directories.join(
        ', ',
      )}`;
    }
    return null;
  }

  /**
   * Creates a tool invocation instance
   * 创建工具调用实例
   * @param params Parameters for the tool invocation\n工具调用的参数
   * @returns A tool invocation instance\n工具调用实例
   */
  protected createInvocation(
    params: LSToolParams,
  ): ToolInvocation<LSToolParams, ToolResult> {
    return new LSToolInvocation(this.config, params);
  }
}
