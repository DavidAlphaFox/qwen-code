/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 文件读取工具模块
 *
 * 该模块提供了读取文件内容的功能，支持：
 * - 读取文本文件（支持指定行号范围）
 * - 读取图片文件（PNG、JPG、GIF、WEBP、SVG、BMP）
 * - 读取 PDF 文件
 *
 * 主要包含两个核心类：
 * - ReadFileTool：工具定义类，定义了工具的参数、验证逻辑等
 * - ReadFileToolInvocation：工具执行类，负责实际执行读取操作
 */

import path from 'node:path';
import { makeRelative, shortenPath } from '../utils/paths.js';
import type { ToolInvocation, ToolLocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';

import type { PartUnion } from '@google/genai';
import {
  processSingleFileContent,
  getSpecificMimeType,
} from '../utils/fileUtils.js';
import type { Config } from '../config/config.js';
import { FileOperation } from '../telemetry/metrics.js';
import { getProgrammingLanguage } from '../telemetry/telemetry-utils.js';
import { logFileOperation } from '../telemetry/loggers.js';
import { FileOperationEvent } from '../telemetry/types.js';
import { isSubpath } from '../utils/paths.js';
import { Storage } from '../config/storage.js';

/**
 * ReadFile 工具的参数接口
 *
 * 定义了读取文件工具所需的参数。
 */
export interface ReadFileToolParams {
  /**
   * The absolute path to the file to read
   * 要读取的文件的绝对路径
   */
  absolute_path: string;

  /**
   * The line number to start reading from (optional)
   * 开始读取的行号（可选），从 0 开始
   */
  offset?: number;

  /**
   * The number of lines to read (optional)
   * 要读取的行数（可选）
   */
  limit?: number;
}

/**
 * ReadFile 工具执行类
 *
 * 负责执行读取文件的具体操作，包括生成工具描述和执行读取逻辑。
 */
class ReadFileToolInvocation extends BaseToolInvocation<
  ReadFileToolParams,
  ToolResult
> {
  /**
   * 构造函数
   *
   * @param config - 配置对象
   * @param params - 读取文件工具的参数
   */
  constructor(
    private config: Config,
    params: ReadFileToolParams,
  ) {
    super(params);
  }

  /**
   * 获取工具描述
   *
   * 生成友好的工具调用描述，显示文件路径和读取范围。
   *
   * @returns 工具描述字符串
   */
  getDescription(): string {
    const relativePath = makeRelative(
      this.params.absolute_path,
      this.config.getTargetDir(),
    );
    const shortPath = shortenPath(relativePath);

    const { offset, limit } = this.params;
    if (offset !== undefined && limit !== undefined) {
      return `${shortPath} (lines ${offset + 1}-${offset + limit})`;
    } else if (offset !== undefined) {
      return `${shortPath} (from line ${offset + 1})`;
    } else if (limit !== undefined) {
      return `${shortPath} (first ${limit} lines)`;
    }

    return shortPath;
  }

  /**
   * 获取工具操作位置
   *
   * 返回工具操作涉及的文件位置信息。
   *
   * @returns 工具位置数组
   */
  override toolLocations(): ToolLocation[] {
    return [{ path: this.params.absolute_path, line: this.params.offset }];
  }

  /**
   * 执行文件读取操作
   *
   * 根据参数读取文件内容，处理可能的错误，并记录遥测数据。
   *
   * @returns 工具执行结果，包含文件内容或错误信息
   */
  async execute(): Promise<ToolResult> {
    const result = await processSingleFileContent(
      this.params.absolute_path,
      this.config,
      this.params.offset,
      this.params.limit,
    );

    if (result.error) {
      return {
        llmContent: result.llmContent,
        returnDisplay: result.returnDisplay || 'Error reading file',
        error: {
          message: result.error,
          type: result.errorType,
        },
      };
    }

    let llmContent: PartUnion;
    if (result.isTruncated) {
      const [start, end] = result.linesShown!;
      const total = result.originalLineCount!;
      llmContent = `Showing lines ${start}-${end} of ${total} total lines.\n\n---\n\n${result.llmContent}`;
    } else {
      llmContent = result.llmContent || '';
    }

    const lines =
      typeof result.llmContent === 'string'
        ? result.llmContent.split('\n').length
        : undefined;
    const mimetype = getSpecificMimeType(this.params.absolute_path);
    const programming_language = getProgrammingLanguage({
      absolute_path: this.params.absolute_path,
    });
    logFileOperation(
      this.config,
      new FileOperationEvent(
        ReadFileTool.Name,
        FileOperation.READ,
        lines,
        mimetype,
        path.extname(this.params.absolute_path),
        programming_language,
      ),
    );

    return {
      llmContent,
      returnDisplay: result.returnDisplay || '',
    };
  }
}

/**
 * ReadFile 工具类
 *
 * 实现文件读取工具的逻辑，包括工具定义、参数验证和工具调用创建。
 */
export class ReadFileTool extends BaseDeclarativeTool<
  ReadFileToolParams,
  ToolResult
> {
  static readonly Name: string = ToolNames.READ_FILE;

  /**
   * 构造函数
   *
   * @param config - 配置对象
   */
  constructor(private config: Config) {
    super(
      ReadFileTool.Name,
      ToolDisplayNames.READ_FILE,
      `Reads and returns the content of a specified file. If the file is large, the content will be truncated. The tool's response will clearly indicate if truncation has occurred and will provide details on how to read more of the file using the 'offset' and 'limit' parameters. Handles text, images (PNG, JPG, GIF, WEBP, SVG, BMP), and PDF files. For text files, it can read specific line ranges.`,
      Kind.Read,
      {
        properties: {
          absolute_path: {
            description:
              "The absolute path to the file to read (e.g., '/home/user/project/file.txt'). Relative paths are not supported. You must provide an absolute path.",
            type: 'string',
          },
          offset: {
            description:
              "Optional: For text files, the 0-based line number to start reading from. Requires 'limit' to be set. Use for paginating through large files.",
            type: 'number',
          },
          limit: {
            description:
              "Optional: For text files, maximum number of lines to read. Use with 'offset' to paginate through large files. If omitted, reads the entire file (if feasible, up to a default limit).",
            type: 'number',
          },
        },
        required: ['absolute_path'],
        type: 'object',
      },
    );
  }

  /**
   * 验证工具参数
   *
   * 检查传入的参数是否有效，包括：
   * - 路径是否为绝对路径
   * - 路径是否在工作空间或允许的目录内
   * - offset 和 limit 参数的值是否合法
   * - 文件是否被 .qwenignore 忽略
   *
   * @param params - 要验证的参数
   * @returns 如果验证失败返回错误消息，否则返回 null
   */
  protected override validateToolParamValues(
    params: ReadFileToolParams,
  ): string | null {
    const filePath = params.absolute_path;
    if (params.absolute_path.trim() === '') {
      return "The 'absolute_path' parameter must be non-empty.";
    }

    if (!path.isAbsolute(filePath)) {
      return `File path must be absolute, but was relative: ${filePath}. You must provide an absolute path.`;
    }

    const workspaceContext = this.config.getWorkspaceContext();
    const globalTempDir = Storage.getGlobalTempDir();
    const projectTempDir = this.config.storage.getProjectTempDir();
    const userSkillsDir = this.config.storage.getUserSkillsDir();
    const resolvedFilePath = path.resolve(filePath);
    const isWithinTempDir =
      isSubpath(projectTempDir, resolvedFilePath) ||
      isSubpath(globalTempDir, resolvedFilePath);
    const isWithinUserSkills = isSubpath(userSkillsDir, resolvedFilePath);

    if (
      !workspaceContext.isPathWithinWorkspace(filePath) &&
      !isWithinTempDir &&
      !isWithinUserSkills
    ) {
      const directories = workspaceContext.getDirectories();
      return `File path must be within one of the workspace directories: ${directories.join(
        ', ',
      )} or within the project temp directory: ${projectTempDir}`;
    }
    if (params.offset !== undefined && params.offset < 0) {
      return 'Offset must be a non-negative number';
    }
    if (params.limit !== undefined && params.limit <= 0) {
      return 'Limit must be a positive number';
    }

    const fileService = this.config.getFileService();
    if (fileService.shouldQwenIgnoreFile(params.absolute_path)) {
      return `File path '${filePath}' is ignored by .qwenignore pattern(s).`;
    }

    return null;
  }

  /**
   * 创建工具调用实例
   *
   * 根据传入的参数创建一个工具执行实例。
   *
   * @param params - 工具参数
   * @returns 工具调用实例
   */
  protected createInvocation(
    params: ReadFileToolParams,
  ): ToolInvocation<ReadFileToolParams, ToolResult> {
    return new ReadFileToolInvocation(this.config, params);
  }
}
