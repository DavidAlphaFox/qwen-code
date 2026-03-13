/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import type { Config } from '../config/config.js';
import { getAllGeminiMdFilenames } from '../tools/memoryTool.js';

/**
 * 多个工具使用的通用忽略模式，用于基本排除
 * 这些是开发项目中最常被忽略的目录
 */
export const COMMON_IGNORE_PATTERNS: string[] = [
  '**/node_modules/**',
  '**/.git/**',
  '**/bower_components/**',
  '**/.svn/**',
  '**/.hg/**',
];

/**
 * 通常从文本处理中排除的二进制文件扩展名模式
 */
export const BINARY_FILE_PATTERNS: string[] = [
  '**/*.bin',
  '**/*.exe',
  '**/*.dll',
  '**/*.so',
  '**/*.dylib',
  '**/*.class',
  '**/*.jar',
  '**/*.war',
  '**/*.zip',
  '**/*.tar',
  '**/*.gz',
  '**/*.bz2',
  '**/*.rar',
  '**/*.7z',
  '**/*.doc',
  '**/*.docx',
  '**/*.xls',
  '**/*.xlsx',
  '**/*.ppt',
  '**/*.pptx',
  '**/*.odt',
  '**/*.ods',
  '**/*.odp',
];

/**
 * 需要在 read-many-files 等工具中特殊处理的媒体文件模式
 * 这些文件在明确请求时可以作为 inlineData 处理
 */
export const MEDIA_FILE_PATTERNS: string[] = [
  '**/*.pdf',
  '**/*.png',
  '**/*.jpg',
  '**/*.jpeg',
  '**/*.gif',
  '**/*.webp',
  '**/*.bmp',
  '**/*.svg',
];

/**
 * 开发项目中通常忽略的常见目录模式
 */
export const COMMON_DIRECTORY_EXCLUDES: string[] = [
  '**/.vscode/**',
  '**/.idea/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/__pycache__/**',
];

/**
 * Python 特定的模式
 */
export const PYTHON_EXCLUDES: string[] = ['**/*.pyc', '**/*.pyo'];

/**
 * 系统和环境文件模式
 */
export const SYSTEM_FILE_EXCLUDES: string[] = ['**/.DS_Store', '**/.env'];

/**
 * 组合所有常见忽略模式的综合文件排除模式
 * 这些模式与 glob 忽略模式兼容
 * 注意：媒体文件（PDF、图片）不在此处排除，因为它们需要在 read-many-files 中特殊处理
 */
export const DEFAULT_FILE_EXCLUDES: string[] = [
  ...COMMON_IGNORE_PATTERNS,
  ...COMMON_DIRECTORY_EXCLUDES,
  ...BINARY_FILE_PATTERNS,
  ...PYTHON_EXCLUDES,
  ...SYSTEM_FILE_EXCLUDES,
];

/**
 * 配置文件排除模式的选项
 */
export interface ExcludeOptions {
  /**
   * 是否包含默认排除模式。默认为 true
   */
  includeDefaults?: boolean;

  /**
   * 来自配置的自定义模式
   */
  customPatterns?: string[];

  /**
   * 运行时提供的其他模式（例如来自 CLI 参数）
   */
  runtimePatterns?: string[];

  /**
   * 是否包含动态模式（如配置的上下文文件名）。默认为 true
   */
  includeDynamicPatterns?: boolean;
}

/**
 * 集中化的文件排除实用程序，为不同工具和用例提供可配置和可扩展的文件排除模式
 */
export class FileExclusions {
  constructor(private config?: Config) {}

  /**
   * 获取基本文件操作（如 glob）所需的核心忽略模式
   * 这些是几乎总是应该排除的最少必要模式
   * @returns 核心忽略模式数组
   */
  getCoreIgnorePatterns(): string[] {
    return [...COMMON_IGNORE_PATTERNS];
  }

  /**
   * 获取 read-many-files 等操作的综合默认排除模式
   * 包括所有标准排除：目录、二进制文件、系统文件等
   * @param options - 排除选项
   * @returns 排除模式数组
   */
  getDefaultExcludePatterns(options: ExcludeOptions = {}): string[] {
    const {
      includeDefaults = true,
      customPatterns = [],
      runtimePatterns = [],
      includeDynamicPatterns = true,
    } = options;

    const patterns: string[] = [];

    // Add base defaults if requested
    if (includeDefaults) {
      patterns.push(...DEFAULT_FILE_EXCLUDES);
    }

    // Add dynamic patterns (like context filenames)
    if (includeDynamicPatterns) {
      for (const filename of getAllGeminiMdFilenames()) {
        patterns.push(`**/${filename}`);
      }
    }

    // Add custom patterns from configuration
    // TODO: getCustomExcludes method needs to be implemented in Config interface
    if (this.config) {
      const configCustomExcludes = this.config.getCustomExcludes?.() ?? [];
      patterns.push(...configCustomExcludes);
    }

    // Add user-provided custom patterns
    patterns.push(...customPatterns);

    // Add runtime patterns (e.g., from CLI)
    patterns.push(...runtimePatterns);

    return patterns;
  }

  /**
   * 获取用于 read-many-files 工具的排除模式，保持向后兼容性
   * 这与之前的 getDefaultExcludes() 函数行为相同
   * @param additionalExcludes - 额外的排除模式
   * @returns 排除模式数组
   */
  getReadManyFilesExcludes(additionalExcludes: string[] = []): string[] {
    return this.getDefaultExcludePatterns({
      includeDefaults: true,
      runtimePatterns: additionalExcludes,
      includeDynamicPatterns: true,
    });
  }

  /**
   * 获取用于 glob 工具操作的排除模式
   * 默认使用核心模式，但可以使用其他模式扩展
   * @param additionalExcludes - 额外的排除模式
   * @returns 排除模式数组
   */
  getGlobExcludes(additionalExcludes: string[] = []): string[] {
    const corePatterns = this.getCoreIgnorePatterns();

    // Add any custom patterns from config if available
    // TODO: getCustomExcludes method needs to be implemented in Config interface
    const configPatterns = this.config?.getCustomExcludes?.() ?? [];

    return [...corePatterns, ...configPatterns, ...additionalExcludes];
  }

  /**
   * 使用完整自定义选项构建排除模式
   * 这是高级用例最灵活的方法
   * @param options - 排除选项
   * @returns 排除模式数组
   */
  buildExcludePatterns(options: ExcludeOptions): string[] {
    return this.getDefaultExcludePatterns(options);
  }
}

/**
 * 从 glob 模式中提取文件扩展名
 * 将类似 glob/*.exe 的模式转换为 .exe
 * 处理大括号扩展如 glob/*.{js,ts} 转换为 .js 和 .ts
 * @param patterns - glob 模式数组
 * @returns 扩展名数组
 */
export function extractExtensionsFromPatterns(patterns: string[]): string[] {
  const extensions = new Set(
    patterns
      .filter((pattern) => pattern.includes('*.'))
      .flatMap((pattern) => {
        const extPart = pattern.substring(pattern.lastIndexOf('*.') + 1);
        // Handle brace expansion e.g. `**/*.{jpg,png}`
        if (extPart.startsWith('.{') && extPart.endsWith('}')) {
          const inner = extPart.slice(2, -1); // get 'jpg,png'
          return inner
            .split(',')
            .map((ext) => `.${ext.trim()}`)
            .filter((ext) => ext !== '.');
        }
        // Handle simple/compound/dotfile extensions
        if (
          extPart.startsWith('.') &&
          !extPart.includes('/') &&
          !extPart.includes('{') &&
          !extPart.includes('}')
        ) {
          // Using path.extname on a dummy file handles various cases like
          // '.tar.gz' -> '.gz' and '.profile' -> '.profile' correctly.
          const extracted = path.extname(`dummy${extPart}`);
          // If extname returns empty (e.g. for '.'), use the original part.
          // Then filter out empty or '.' results and invalid double dot patterns.
          const result = extracted || extPart;
          return result && result !== '.' && !result.substring(1).includes('.')
            ? [result]
            : [];
        }
        return [];
      }),
  );
  return Array.from(extensions).sort();
}

/**
 * 从 BINARY_FILE_PATTERNS 提取的二进制文件扩展名，用于快速查找
 * 为完整性起见，还包含了模式中未涵盖的其他扩展名
 */
export const BINARY_EXTENSIONS: string[] = [
  ...extractExtensionsFromPatterns([
    ...BINARY_FILE_PATTERNS,
    ...MEDIA_FILE_PATTERNS,
    ...PYTHON_EXCLUDES,
  ]),
  // Additional binary extensions not in the main patterns
  '.dat',
  '.obj',
  '.o',
  '.a',
  '.lib',
  '.wasm',
].sort();
