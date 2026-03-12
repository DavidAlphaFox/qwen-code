/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Glob 工具模块
 *
 * 该模块提供了基于 glob 模式的文件查找功能，支持在各种代码库中快速查找文件。
 * 主要功能包括：
 * - 支持常见的 glob 模式（如 **/*.js、src/**/*.ts）
 * - 返回按修改时间排序的匹配文件路径
 * - 支持路径过滤和文件过滤
 * - 限制返回的文件数量以避免性能问题
 */

import fs from 'node:fs';
import path from 'node:path';
import { glob, escape } from 'glob';
import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';
import { resolveAndValidatePath } from '../utils/paths.js';
import { type Config } from '../config/config.js';
import {
  DEFAULT_FILE_FILTERING_OPTIONS,
  type FileFilteringOptions,
} from '../config/constants.js';
import { ToolErrorType } from './tool-error.js';
import { getErrorMessage } from '../utils/errors.js';
import type { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('GLOB');

const MAX_FILE_COUNT = 100;

// Subset of 'Path' interface provided by 'glob' that we can implement for testing
/**
 * Glob 路径接口
 *
 * 'glob' 库提供的 Path 接口的子集，用于在测试中实现。
 *
 * @interface
 * @description 表示文件路径的基本信息，包括完整路径和修改时间
 * @example
 * ```typescript
 * const path: GlobPath = {
 *   fullpath: () => '/path/to/file.txt',
 *   mtimeMs: 1234567890
 * }
 * ```
 */
export interface GlobPath {
  fullpath(): string;
  mtimeMs?: number;
}

/**
 * Sorts file entries based on recency and then alphabetically.
 * Recent files (modified within recencyThresholdMs) are listed first, newest to oldest.
 * Older files are listed after recent ones, sorted alphabetically by path.
 *
 * @zh-CN 根据文件的新旧程度和字母顺序对文件条目进行排序
 * @zh-CN 最近修改的文件（在 recencyThresholdMs 毫秒内）列在最前面，按修改时间从新到旧排序
 * @zh-CN 较旧的文件列在最近文件之后，按路径字母顺序排序
 */
export function sortFileEntries(
  entries: GlobPath[],
  nowTimestamp: number,
  recencyThresholdMs: number,
): GlobPath[] {
  const sortedEntries = [...entries];
  sortedEntries.sort((a, b) => {
    const mtimeA = a.mtimeMs ?? 0;
    const mtimeB = b.mtimeMs ?? 0;
    const aIsRecent = nowTimestamp - mtimeA < recencyThresholdMs;
    const bIsRecent = nowTimestamp - mtimeB < recencyThresholdMs;

    if (aIsRecent && bIsRecent) {
      return mtimeB - mtimeA;
    } else if (aIsRecent) {
      return -1;
    } else if (bIsRecent) {
      return 1;
    } else {
      return a.fullpath().localeCompare(b.fullpath());
    }
  });
  return sortedEntries;
}

/**
 * Parameters for the GlobTool
 *
 * @zh-CN Glob 工具的参数接口
 * @zh-CN 定义了 Glob 工具执行时所需的参数
 */
export interface GlobToolParams {
  /**
   * The glob pattern to match files against
   *
   * @zh-CN 用于匹配文件的 glob 模式
   * @zh-CN 支持常见的 glob 模式语法，如 "**/*.js" 或 "src/**/*.ts"
   */
  pattern: string;

  /**
   * The directory to search in (optional, defaults to current directory)
   *
   * @zh-CN 搜索目录（可选，默认为当前目录）
   * @zh-CN 如果不指定，则在工作目录中搜索
   */
  path?: string;
}

/**
 * Glob 工具执行类
 *
 * @zh-CN 负责执行 Glob 工具的具体逻辑
 * @zh-CN 处理文件模式匹配、路径验证和文件过滤
 * @internal
 */
class GlobToolInvocation extends BaseToolInvocation<
  GlobToolParams,
  ToolResult
> {
  private fileService: FileDiscoveryService;

  constructor(
    private config: Config,
    params: GlobToolParams,
  ) {
    super(params);
    this.fileService = config.getFileService();
  }

  getDescription(): string {
    let description = `'${this.params.pattern}'`;
    if (this.params.path) {
      description += ` in path '${this.params.path}'`;
    }

    return description;
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    try {
      // Default to target directory if no path is provided
      const searchDirAbs = resolveAndValidatePath(
        this.config,
        this.params.path,
      );
      const searchLocationDescription = this.params.path
        ? `within ${searchDirAbs}`
        : `in the workspace directory`;

      // Collect entries from the search directory
      let pattern = this.params.pattern;
      const fullPath = path.join(searchDirAbs, pattern);
      if (fs.existsSync(fullPath)) {
        pattern = escape(pattern);
      }

      const allEntries = (await glob(pattern, {
        cwd: searchDirAbs,
        withFileTypes: true,
        nodir: true,
        stat: true,
        nocase: true,
        dot: true,
        follow: false,
        signal,
      })) as GlobPath[];

      const relativePaths = allEntries.map((p) =>
        path.relative(this.config.getTargetDir(), p.fullpath()),
      );

      const { filteredPaths } = this.fileService.filterFilesWithReport(
        relativePaths,
        this.getFileFilteringOptions(),
      );

      const normalizePathForComparison = (p: string) =>
        process.platform === 'win32' || process.platform === 'darwin'
          ? p.toLowerCase()
          : p;

      const filteredAbsolutePaths = new Set(
        filteredPaths.map((p) =>
          normalizePathForComparison(
            path.resolve(this.config.getTargetDir(), p),
          ),
        ),
      );

      const filteredEntries = allEntries.filter((entry) =>
        filteredAbsolutePaths.has(normalizePathForComparison(entry.fullpath())),
      );

      if (!filteredEntries || filteredEntries.length === 0) {
        return {
          llmContent: `No files found matching pattern "${this.params.pattern}" ${searchLocationDescription}`,
          returnDisplay: `No files found`,
        };
      }

      // Set filtering such that we first show the most recent files
      const oneDayInMs = 24 * 60 * 60 * 1000;
      const nowTimestamp = new Date().getTime();

      // Sort the filtered entries using the new helper function
      const sortedEntries = sortFileEntries(
        filteredEntries,
        nowTimestamp,
        oneDayInMs,
      );

      const totalFileCount = sortedEntries.length;
      const fileLimit = Math.min(
        MAX_FILE_COUNT,
        this.config.getTruncateToolOutputLines(),
      );
      const truncated = totalFileCount > fileLimit;

      // Limit to fileLimit if needed
      const entriesToShow = truncated
        ? sortedEntries.slice(0, fileLimit)
        : sortedEntries;

      const sortedAbsolutePaths = entriesToShow.map((entry) =>
        entry.fullpath(),
      );
      const fileListDescription = sortedAbsolutePaths.join('\n');

      let resultMessage = `Found ${totalFileCount} file(s) matching "${this.params.pattern}" ${searchLocationDescription}`;
      resultMessage += `, sorted by modification time (newest first):\n---\n${fileListDescription}`;

      // Add truncation notice if needed
      if (truncated) {
        const omittedFiles = totalFileCount - fileLimit;
        const fileTerm = omittedFiles === 1 ? 'file' : 'files';
        resultMessage += `\n---\n[${omittedFiles} ${fileTerm} truncated] ...`;
      }

      return {
        llmContent: resultMessage,
        returnDisplay: `Found ${totalFileCount} matching file(s)${truncated ? ' (truncated)' : ''}`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      debugLogger.error(`GlobLogic execute Error: ${errorMessage}`, error);
      const rawError = `Error during glob search operation: ${errorMessage}`;
      return {
        llmContent: rawError,
        returnDisplay: `Error: ${errorMessage || 'An unexpected error occurred.'}`,
        error: {
          message: rawError,
          type: ToolErrorType.GLOB_EXECUTION_ERROR,
        },
      };
    }
  }

  private getFileFilteringOptions(): FileFilteringOptions {
    const options = this.config.getFileFilteringOptions?.();
    return {
      respectGitIgnore:
        options?.respectGitIgnore ??
        DEFAULT_FILE_FILTERING_OPTIONS.respectGitIgnore,
      respectQwenIgnore:
        options?.respectQwenIgnore ??
        DEFAULT_FILE_FILTERING_OPTIONS.respectQwenIgnore,
    };
  }
}

/**
 * Implementation of the Glob tool logic
 *
 * @zh-CN Glob 工具的实现类
 * @zh-CN 提供基于 glob 模式的快速文件匹配功能
 * @zh-CN 支持各种代码库规模，返回按修改时间排序的匹配文件路径
 */
export class GlobTool extends BaseDeclarativeTool<GlobToolParams, ToolResult> {
  static readonly Name = ToolNames.GLOB;

  constructor(private config: Config) {
    super(
      GlobTool.Name,
      ToolDisplayNames.GLOB,
      'Fast file pattern matching tool that works with any codebase size\n- Supports glob patterns like "**/*.js" or "src/**/*.ts"\n- Returns matching file paths sorted by modification time\n- Use this tool when you need to find files by name patterns\n- When you are doing an open ended search that may require multiple rounds of globbing and grepping, use the Agent tool instead\n- You have the capability to call multiple tools in a single response. It is always better to speculatively perform multiple searches as a batch that are potentially useful.',
      Kind.Search,
      {
        properties: {
          pattern: {
            description: 'The glob pattern to match files against',
            type: 'string',
          },
          path: {
            description:
              'The directory to search in. If not specified, the current working directory will be used. IMPORTANT: Omit this field to use the default directory. DO NOT enter "undefined" or "null" - simply omit it for the default behavior. Must be a valid directory path if provided.',
            type: 'string',
          },
        },
        required: ['pattern'],
        type: 'object',
      },
    );
  }

  /**
   * Validates the parameters for the tool.
   */
  protected override validateToolParamValues(
    params: GlobToolParams,
  ): string | null {
    if (
      !params.pattern ||
      typeof params.pattern !== 'string' ||
      params.pattern.trim() === ''
    ) {
      return "The 'pattern' parameter cannot be empty.";
    }

    // Only validate path if one is provided
    if (params.path) {
      try {
        resolveAndValidatePath(this.config, params.path);
      } catch (error) {
        return getErrorMessage(error);
      }
    }

    return null;
  }

  protected createInvocation(
    params: GlobToolParams,
  ): ToolInvocation<GlobToolParams, ToolResult> {
    return new GlobToolInvocation(this.config, params);
  }
}
