/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 编辑工具模块
 *
 * 提供文件编辑功能，支持替换文件中的文本内容。
 * 可以创建新文件或修改现有文件的内容，支持单次替换和全局替换。
 *
 * 主要功能：
 * - 使用精确的文本替换来编辑文件
 * - 支持创建新文件
 * - 支持替换所有匹配项
 * - 提供差异预览和用户确认机制
 * - 保留文件的原始编码和 BOM
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as Diff from 'diff';
import type {
  ToolCallConfirmationDetails,
  ToolEditConfirmationDetails,
  ToolInvocation,
  ToolLocation,
  ToolResult,
} from './tools.js';
import { BaseDeclarativeTool, Kind, ToolConfirmationOutcome } from './tools.js';
import { ToolErrorType } from './tool-error.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { isNodeError } from '../utils/errors.js';
import type { Config } from '../config/config.js';
import { ApprovalMode } from '../config/config.js';
import { FileEncoding } from '../services/fileSystemService.js';
import { DEFAULT_DIFF_OPTIONS, getDiffStat } from './diffOptions.js';
import { ReadFileTool } from './read-file.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';
import { logFileOperation } from '../telemetry/loggers.js';
import { FileOperationEvent } from '../telemetry/types.js';
import { FileOperation } from '../telemetry/metrics.js';
import { getSpecificMimeType } from '../utils/fileUtils.js';
import { getLanguageFromFilePath } from '../utils/language-detection.js';
import type {
  ModifiableDeclarativeTool,
  ModifyContext,
} from './modifiable-tool.js';
import { IdeClient } from '../ide/ide-client.js';
import { safeLiteralReplace } from '../utils/textUtils.js';
import { createDebugLogger } from '../utils/debugLogger.js';
import {
  countOccurrences,
  extractEditSnippet,
  maybeAugmentOldStringForDeletion,
  normalizeEditStrings,
} from '../utils/editHelper.js';

const debugLogger = createDebugLogger('EDIT');

/**
 * 应用文本替换操作
 *
 * 根据提供的参数在当前内容中执行文本替换。
 * 如果是新文件创建，直接返回新字符串；否则执行安全的字面替换。
 *
 * @param currentContent - 文件的当前内容，如果文件不存在则为 null
 * @param oldString - 要被替换的旧文本
 * @param newString - 要替换成的新文本
 * @param isNewFile - 是否为创建新文件的操作
 * @returns 替换后的内容
 */
export function applyReplacement(
  currentContent: string | null,
  oldString: string,
  newString: string,
  isNewFile: boolean,
): string {
  if (isNewFile) {
    return newString;
  }
  if (currentContent === null) {
    // Should not happen if not a new file, but defensively return empty or newString if oldString is also empty
    return oldString === '' ? newString : '';
  }
  // If oldString is empty and it's not a new file, do not modify the content.
  if (oldString === '' && !isNewFile) {
    return currentContent;
  }

  // Use intelligent replacement that handles $ sequences safely
  return safeLiteralReplace(currentContent, oldString, newString);
}

/**
 * 编辑工具参数接口
 *
 * 定义编辑工具所需的参数类型
 */
export interface EditToolParams {
  /**
   * The absolute path to the file to modify
   * 要修改的文件的绝对路径
   */
  file_path: string;

  /**
   * The text to replace
   * 要被替换的文本
   */
  old_string: string;

  /**
   * The text to replace it with
   * 要替换成的新文本
   */
  new_string: string;

  /**
   * Replace every occurrence of old_string instead of requiring a unique match.
   * 替换所有匹配的 old_string，而不是要求唯一匹配
   */
  replace_all?: boolean;

  /**
   * Whether the edit was modified manually by the user.
   * 编辑是否由用户手动修改
   */
  modified_by_user?: boolean;

  /**
   * Initially proposed content.
   * 最初提议的内容
   */
  ai_proposed_content?: string;
}

/**
 * 计算出的编辑结果接口
 *
 * 存储编辑操作的计算结果，包括新旧内容、匹配次数、错误信息等
 */
interface CalculatedEdit {
  /** 文件的当前内容 */
  currentContent: string | null;
  /** 编辑后的新内容 */
  newContent: string;
  /** old_string 匹配到的次数 */
  occurrences: number;
  /** 错误信息（如果有） */
  error?: { display: string; raw: string; type: ToolErrorType };
  /** 是否为新创建的文件 */
  isNewFile: boolean;
  /** Detected encoding of the existing file (e.g. 'utf-8', 'gbk')
   * 检测到的现有文件编码（例如 'utf-8', 'gbk'） */
  encoding: string;
  /** Whether the existing file has a UTF-8 BOM
   * 现有文件是否具有 UTF-8 BOM */
  bom: boolean;
}

/**
 * 编辑工具调用类
 *
 * 负责执行编辑操作的具体逻辑，包括计算编辑结果、处理用户确认、执行实际的文件写入等
 */
class EditToolInvocation implements ToolInvocation<EditToolParams, ToolResult> {
  constructor(
    private readonly config: Config,
    public params: EditToolParams,
  ) {}

  toolLocations(): ToolLocation[] {
    return [{ path: this.params.file_path }];
  }

  /**
   * Calculates the potential outcome of an edit operation.
   * 计算编辑操作的潜在结果。
   * @param params Parameters for the edit operation / 编辑操作的参数
   * @returns An object describing the potential edit outcome / 描述潜在编辑结果的对象
   * @throws File system errors if reading the file fails unexpectedly (e.g., permissions)
   *         如果读取文件意外失败（例如权限问题），抛出文件系统错误
   */
  private async calculateEdit(params: EditToolParams): Promise<CalculatedEdit> {
    const replaceAll = params.replace_all ?? false;
    let currentContent: string | null = null;
    let fileExists = false;
    let isNewFile = false;
    let finalNewString = params.new_string;
    let finalOldString = params.old_string;
    let occurrences = 0;
    let encoding = 'utf-8';
    let bom = false;
    let error:
      | { display: string; raw: string; type: ToolErrorType }
      | undefined = undefined;

    try {
      const fileInfo = await this.config
        .getFileSystemService()
        .readTextFileWithInfo(params.file_path);
      // Normalize line endings to LF for consistent processing.
      currentContent = fileInfo.content.replace(/\r\n/g, '\n');
      fileExists = true;
      // Encoding and BOM are returned from the same I/O pass, avoiding redundant reads.
      encoding = fileInfo.encoding;
      bom = fileInfo.bom;
    } catch (err: unknown) {
      if (!isNodeError(err) || err.code !== 'ENOENT') {
        // Rethrow unexpected FS errors (permissions, etc.)
        throw err;
      }
      fileExists = false;
    }

    const normalizedStrings = normalizeEditStrings(
      currentContent,
      finalOldString,
      finalNewString,
    );
    finalOldString = normalizedStrings.oldString;
    finalNewString = normalizedStrings.newString;

    if (finalOldString === '' && !fileExists) {
      // Creating a new file
      isNewFile = true;
    } else if (!fileExists) {
      // Trying to edit a nonexistent file (and old_string is not empty)
      error = {
        display: `File not found. Cannot apply edit. Use an empty old_string to create a new file.`,
        raw: `File not found: ${params.file_path}`,
        type: ToolErrorType.FILE_NOT_FOUND,
      };
    } else if (currentContent !== null) {
      finalOldString = maybeAugmentOldStringForDeletion(
        currentContent,
        finalOldString,
        finalNewString,
      );

      occurrences = countOccurrences(currentContent, finalOldString);
      if (params.old_string === '') {
        // Error: Trying to create a file that already exists
        error = {
          display: `Failed to edit. Attempted to create a file that already exists.`,
          raw: `File already exists, cannot create: ${params.file_path}`,
          type: ToolErrorType.ATTEMPT_TO_CREATE_EXISTING_FILE,
        };
      } else if (occurrences === 0) {
        error = {
          display: `Failed to edit, could not find the string to replace.`,
          raw: `Failed to edit, 0 occurrences found for old_string in ${params.file_path}. No edits made. The exact text in old_string was not found. Ensure you're not escaping content incorrectly and check whitespace, indentation, and context. Use ${ReadFileTool.Name} tool to verify.`,
          type: ToolErrorType.EDIT_NO_OCCURRENCE_FOUND,
        };
      } else if (!replaceAll && occurrences > 1) {
        error = {
          display: `Failed to edit because the text matches multiple locations. Provide more context or set replace_all to true.`,
          raw: `Failed to edit. Found ${occurrences} occurrences for old_string in ${params.file_path} but replace_all was not enabled.`,
          type: ToolErrorType.EDIT_EXPECTED_OCCURRENCE_MISMATCH,
        };
      } else if (finalOldString === finalNewString) {
        error = {
          display: `No changes to apply. The old_string and new_string are identical.`,
          raw: `No changes to apply. The old_string and new_string are identical in file: ${params.file_path}`,
          type: ToolErrorType.EDIT_NO_CHANGE,
        };
      }
    } else {
      // Should not happen if fileExists and no exception was thrown, but defensively:
      error = {
        display: `Failed to read content of file.`,
        raw: `Failed to read content of existing file: ${params.file_path}`,
        type: ToolErrorType.READ_CONTENT_FAILURE,
      };
    }

    const newContent = !error
      ? applyReplacement(
          currentContent,
          finalOldString,
          finalNewString,
          isNewFile,
        )
      : (currentContent ?? '');

    if (!error && fileExists && currentContent === newContent) {
      error = {
        display:
          'No changes to apply. The new content is identical to the current content.',
        raw: `No changes to apply. The new content is identical to the current content in file: ${params.file_path}`,
        type: ToolErrorType.EDIT_NO_CHANGE,
      };
    }

    return {
      currentContent,
      newContent,
      occurrences,
      error,
      isNewFile,
      encoding,
      bom,
    };
  }

  /**
   * Handles the confirmation prompt for the Edit tool in the CLI.
   * It needs to calculate the diff to show the user.
   * 处理编辑工具在 CLI 中的确认提示。
   * 需要计算差异以向用户显示。
   */
  async shouldConfirmExecute(
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    const mode = this.config.getApprovalMode();
    if (mode === ApprovalMode.AUTO_EDIT || mode === ApprovalMode.YOLO) {
      return false;
    }

    let editData: CalculatedEdit;
    try {
      editData = await this.calculateEdit(this.params);
    } catch (error) {
      if (abortSignal.aborted) {
        throw error;
      }
      const errorMsg = error instanceof Error ? error.message : String(error);
      debugLogger.warn(`Error preparing edit: ${errorMsg}`);
      return false;
    }

    if (editData.error) {
      debugLogger.warn(`Error: ${editData.error.display}`);
      return false;
    }

    const fileName = path.basename(this.params.file_path);
    const fileDiff = Diff.createPatch(
      fileName,
      editData.currentContent ?? '',
      editData.newContent,
      'Current',
      'Proposed',
      DEFAULT_DIFF_OPTIONS,
    );
    const ideClient = await IdeClient.getInstance();
    const ideConfirmation =
      this.config.getIdeMode() && ideClient.isDiffingEnabled()
        ? ideClient.openDiff(this.params.file_path, editData.newContent)
        : undefined;

    const confirmationDetails: ToolEditConfirmationDetails = {
      type: 'edit',
      title: `Confirm Edit: ${shortenPath(makeRelative(this.params.file_path, this.config.getTargetDir()))}`,
      fileName,
      filePath: this.params.file_path,
      fileDiff,
      originalContent: editData.currentContent,
      newContent: editData.newContent,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
        }

        if (ideConfirmation) {
          const result = await ideConfirmation;
          if (result.status === 'accepted' && result.content) {
            // TODO(chrstn): See https://github.com/google-gemini/gemini-cli/pull/5618#discussion_r2255413084
            // for info on a possible race condition where the file is modified on disk while being edited.
            this.params.old_string = editData.currentContent ?? '';
            this.params.new_string = result.content;
          }
        }
      },
      ideConfirmation,
    };
    return confirmationDetails;
  }

  getDescription(): string {
    const relativePath = makeRelative(
      this.params.file_path,
      this.config.getTargetDir(),
    );
    if (this.params.old_string === '') {
      return `Create ${shortenPath(relativePath)}`;
    }

    const oldStringSnippet =
      this.params.old_string.split('\n')[0].substring(0, 30) +
      (this.params.old_string.length > 30 ? '...' : '');
    const newStringSnippet =
      this.params.new_string.split('\n')[0].substring(0, 30) +
      (this.params.new_string.length > 30 ? '...' : '');

    if (this.params.old_string === this.params.new_string) {
      return `No file changes to ${shortenPath(relativePath)}`;
    }
    return `${shortenPath(relativePath)}: ${oldStringSnippet} => ${newStringSnippet}`;
  }

  /**
   * Executes the edit operation with the given parameters.
   * 执行具有给定参数的编辑操作。
   * @param params Parameters for the edit operation / 编辑操作的参数
   * @returns Result of the edit operation / 编辑操作的结果
   */
  async execute(signal: AbortSignal): Promise<ToolResult> {
    let editData: CalculatedEdit;
    try {
      editData = await this.calculateEdit(this.params);
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error preparing edit: ${errorMsg}`,
        returnDisplay: `Error preparing edit: ${errorMsg}`,
        error: {
          message: errorMsg,
          type: ToolErrorType.EDIT_PREPARATION_FAILURE,
        },
      };
    }

    if (editData.error) {
      return {
        llmContent: editData.error.raw,
        returnDisplay: `Error: ${editData.error.display}`,
        error: {
          message: editData.error.raw,
          type: editData.error.type,
        },
      };
    }

    try {
      this.ensureParentDirectoriesExist(this.params.file_path);

      // For new files, apply default file encoding setting
      // For existing files, preserve the original encoding (BOM and charset)
      if (editData.isNewFile) {
        const useBOM =
          this.config.getDefaultFileEncoding() === FileEncoding.UTF8_BOM;
        await this.config
          .getFileSystemService()
          .writeTextFile(this.params.file_path, editData.newContent, {
            bom: useBOM,
          });
      } else {
        await this.config
          .getFileSystemService()
          .writeTextFile(this.params.file_path, editData.newContent, {
            bom: editData.bom,
            encoding: editData.encoding,
          });
      }

      const fileName = path.basename(this.params.file_path);
      const originallyProposedContent =
        this.params.ai_proposed_content || editData.newContent;
      const diffStat = getDiffStat(
        fileName,
        editData.currentContent ?? '',
        originallyProposedContent,
        editData.newContent,
      );

      const fileDiff = Diff.createPatch(
        fileName,
        editData.currentContent ?? '', // Should not be null here if not isNewFile
        editData.newContent,
        'Current',
        'Proposed',
        DEFAULT_DIFF_OPTIONS,
      );
      const displayResult = {
        fileDiff,
        fileName,
        originalContent: editData.currentContent,
        newContent: editData.newContent,
        diffStat,
      };

      // Log file operation for telemetry (without diff_stat to avoid double-counting)
      const mimetype = getSpecificMimeType(this.params.file_path);
      const programmingLanguage = getLanguageFromFilePath(
        this.params.file_path,
      );
      const extension = path.extname(this.params.file_path);
      const operation = editData.isNewFile
        ? FileOperation.CREATE
        : FileOperation.UPDATE;

      logFileOperation(
        this.config,
        new FileOperationEvent(
          EditTool.Name,
          operation,
          editData.newContent.split('\n').length,
          mimetype,
          extension,
          programmingLanguage,
        ),
      );

      const llmSuccessMessageParts = [
        editData.isNewFile
          ? `Created new file: ${this.params.file_path} with provided content.`
          : `The file: ${this.params.file_path} has been updated.`,
      ];

      const snippetResult = extractEditSnippet(
        editData.currentContent,
        editData.newContent,
      );
      if (snippetResult) {
        const snippetText = `Showing lines ${snippetResult.startLine}-${snippetResult.endLine} of ${snippetResult.totalLines} from the edited file:\n\n---\n\n${snippetResult.content}`;
        llmSuccessMessageParts.push(snippetText);
      }

      return {
        llmContent: llmSuccessMessageParts.join(' '),
        returnDisplay: displayResult,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error executing edit: ${errorMsg}`,
        returnDisplay: `Error writing file: ${errorMsg}`,
        error: {
          message: errorMsg,
          type: ToolErrorType.FILE_WRITE_FAILURE,
        },
      };
    }
  }

  /**
   * Creates parent directories if they don't exist
   * 如果父目录不存在，则创建它们
   */
  private ensureParentDirectoriesExist(filePath: string): void {
    const dirName = path.dirname(filePath);
    if (!fs.existsSync(dirName)) {
      fs.mkdirSync(dirName, { recursive: true });
    }
  }
}

/**
 * Implementation of the Edit tool logic
 * 编辑工具逻辑的实现类
 *
 * 提供文件编辑功能的公共 API，定义工具的参数、验证规则和描述信息
 */
export class EditTool
  extends BaseDeclarativeTool<EditToolParams, ToolResult>
  implements ModifiableDeclarativeTool<EditToolParams>
{
  static readonly Name = ToolNames.EDIT;
  constructor(private readonly config: Config) {
    super(
      EditTool.Name,
      ToolDisplayNames.EDIT,
      `Replaces text within a file. By default, replaces a single occurrence. Set \`replace_all\` to true when you intend to modify every instance of \`old_string\`. This tool requires providing significant context around the change to ensure precise targeting. Always use the ${ReadFileTool.Name} tool to examine the file's current content before attempting a text replacement.

      The user has the ability to modify the \`new_string\` content. If modified, this will be stated in the response.

Expectation for required parameters:
1. \`file_path\` MUST be an absolute path; otherwise an error will be thrown.
2. \`old_string\` MUST be the exact literal text to replace (including all whitespace, indentation, newlines, and surrounding code etc.).
3. \`new_string\` MUST be the exact literal text to replace \`old_string\` with (also including all whitespace, indentation, newlines, and surrounding code etc.). Ensure the resulting code is correct and idiomatic.
4. NEVER escape \`old_string\` or \`new_string\`, that would break the exact literal text requirement.
**Important:** If ANY of the above are not satisfied, the tool will fail. CRITICAL for \`old_string\`: Must uniquely identify the single instance to change. Include at least 3 lines of context BEFORE and AFTER the target text, matching whitespace and indentation precisely. If this string matches multiple locations, or does not match exactly, the tool will fail.
**Multiple replacements:** Set \`replace_all\` to true when you want to replace every occurrence that matches \`old_string\`.`,
      Kind.Edit,
      {
        properties: {
          file_path: {
            description:
              "The absolute path to the file to modify. Must start with '/'.",
            type: 'string',
          },
          old_string: {
            description:
              'The exact literal text to replace, preferably unescaped. For single replacements (default), include at least 3 lines of context BEFORE and AFTER the target text, matching whitespace and indentation precisely. If this string is not the exact literal text (i.e. you escaped it) or does not match exactly, the tool will fail.',
            type: 'string',
          },
          new_string: {
            description:
              'The exact literal text to replace `old_string` with, preferably unescaped. Provide the EXACT text. Ensure the resulting code is correct and idiomatic.',
            type: 'string',
          },
          replace_all: {
            type: 'boolean',
            description:
              'Replace all occurrences of old_string (default false).',
          },
        },
        required: ['file_path', 'old_string', 'new_string'],
        type: 'object',
      },
    );
  }

  /**
   * Validates the parameters for the Edit tool
   * 验证编辑工具的参数
   * @param params Parameters to validate / 要验证的参数
   * @returns Error message string or null if valid / 错误消息字符串，如果有效则为 null
   */
  protected override validateToolParamValues(
    params: EditToolParams,
  ): string | null {
    if (!params.file_path) {
      return "The 'file_path' parameter must be non-empty.";
    }

    if (!path.isAbsolute(params.file_path)) {
      return `File path must be absolute: ${params.file_path}`;
    }

    const workspaceContext = this.config.getWorkspaceContext();
    if (!workspaceContext.isPathWithinWorkspace(params.file_path)) {
      const directories = workspaceContext.getDirectories();
      return `File path must be within one of the workspace directories: ${directories.join(', ')}`;
    }

    return null;
  }

  protected createInvocation(
    params: EditToolParams,
  ): ToolInvocation<EditToolParams, ToolResult> {
    return new EditToolInvocation(this.config, params);
  }

  /**
   * Gets the modification context for the Edit tool.
   * 获取编辑工具的修改上下文。
   * 这个方法提供修改上下文，允许 IDE 集成时获取和修改编辑内容
   */
  getModifyContext(_: AbortSignal): ModifyContext<EditToolParams> {
    return {
      getFilePath: (params: EditToolParams) => params.file_path,
      getCurrentContent: async (params: EditToolParams): Promise<string> => {
        try {
          return this.config
            .getFileSystemService()
            .readTextFile(params.file_path);
        } catch (err) {
          if (!isNodeError(err) || err.code !== 'ENOENT') throw err;
          return '';
        }
      },
      getProposedContent: async (params: EditToolParams): Promise<string> => {
        try {
          const currentContent = await this.config
            .getFileSystemService()
            .readTextFile(params.file_path);
          return applyReplacement(
            currentContent,
            params.old_string,
            params.new_string,
            params.old_string === '' && currentContent === '',
          );
        } catch (err) {
          if (!isNodeError(err) || err.code !== 'ENOENT') throw err;
          return '';
        }
      },
      createUpdatedParams: (
        oldContent: string,
        modifiedProposedContent: string,
        originalParams: EditToolParams,
      ): EditToolParams => ({
        ...originalParams,
        ai_proposed_content: oldContent,
        old_string: oldContent,
        new_string: modifiedProposedContent,
        modified_by_user: true,
      }),
    };
  }
}
