/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 管理 LLM 输出语言规则文件的工具函数
 * 此文件处理 ~/.qwen/output-language.md 的创建和维护
 * 该文件指示 LLM 以用户首选语言回复
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Storage } from '@qwen-code/qwen-code-core';
import {
  detectSystemLanguage,
  getLanguageNameFromLocale,
} from '../i18n/index.js';

const LLM_OUTPUT_LANGUAGE_RULE_FILENAME = 'output-language.md';
const LLM_OUTPUT_LANGUAGE_MARKER_PREFIX = 'qwen-code:llm-output-language:';

/** 表示"从系统设置检测"特殊值 */
export const OUTPUT_LANGUAGE_AUTO = 'auto';

/**
 * 检查值是否表示"自动"设置
 * @param value - 要检查的值
 * @returns boolean 是否为自动语言
 */
export function isAutoLanguage(value: string | undefined | null): boolean {
  return !value || value.toLowerCase() === OUTPUT_LANGUAGE_AUTO;
}

/**
 * 将语言输入规范化为其规范形式
 * 将已知的区域设置代码（例如 "zh"、"ru"）转换为完整名称（例如 "Chinese"、"Russian"）
 * 未知输入按原样返回以支持任何语言名称
 * @param language - 语言字符串
 * @returns string 规范化后的语言
 */
export function normalizeOutputLanguage(language: string): string {
  const lowered = language.toLowerCase();
  const fullName = getLanguageNameFromLocale(lowered);
  // getLanguageNameFromLocale 对未知代码返回 'English' 作为默认值
  // 仅在它是已知代码或显式为 'en' 时使用结果
  if (fullName !== 'English' || lowered === 'en') {
    return fullName;
  }
  return language;
}

/**
 * 解析输出语言，将 'auto' 转换为检测到的系统语言
 * @param value - 语言值
 * @returns string 解析后的语言
 */
export function resolveOutputLanguage(
  value: string | undefined | null,
): string {
  if (isAutoLanguage(value)) {
    const detectedLocale = detectSystemLanguage();
    return getLanguageNameFromLocale(detectedLocale);
  }
  return normalizeOutputLanguage(value!);
}

/**
 * 返回 LLM 输出语言规则文件的路径（~/.qwen/output-language.md）
 * @returns string 文件路径
 */
function getOutputLanguageFilePath(): string {
  return path.join(
    Storage.getGlobalQwenDir(),
    LLM_OUTPUT_LANGUAGE_RULE_FILENAME,
  );
}

/**
 * 清理语言字符串以用于 HTML 注释标记
 * 移除可能破坏 HTML 注释语法的字符
 * @param language - 语言字符串
 * @returns string 清理后的语言
 */
function sanitizeForMarker(language: string): string {
  return language
    .replace(/[\r\n]/g, ' ')
    .replace(/--!?>/g, '')
    .replace(/--/g, '');
}

/**
 * 生成 LLM 输出语言规则文件的内容
 * @param language - 语言名称
 * @returns string 文件内容
 */
function generateOutputLanguageFileContent(language: string): string {
  const safeLanguage = sanitizeForMarker(language);
  return `# Output language preference: ${language}
<!-- ${LLM_OUTPUT_LANGUAGE_MARKER_PREFIX} ${safeLanguage} -->

## Rule
You MUST always respond in **${language}** regardless of the user's input language.
This is a mandatory requirement, not a preference.

## Exception
If the user **explicitly** requests a response in a specific language (e.g., "please reply in English", "用中文回答"), switch to the user's requested language for the remainder of the conversation.

## Keep technical artifacts unchanged
Do **not** translate or rewrite:
- Code blocks, CLI commands, file paths, stack traces, logs, JSON keys, identifiers
- Exact quoted text from the user (keep quotes verbatim)

## Tool / system outputs
Raw tool/system outputs may contain fixed-format English. Preserve them verbatim, and if needed, add a short **${language}** explanation below.
`;
}

/**
 * 从输出语言规则文件的内容中提取语言
 * 支持新标记格式和旧标题格式
 * @param content - 文件内容
 * @returns string | null 提取的语言，如果无法解析则返回 null
 */
function parseOutputLanguageFromContent(content: string): string | null {
  // 主要：机器可读标记（例如 <!-- qwen-code:llm-output-language: 中文 -->）
  const markerRegex = new RegExp(
    String.raw`<!--\s*${LLM_OUTPUT_LANGUAGE_MARKER_PREFIX}\s*(.*?)\s*-->`,
    'i',
  );
  const markerMatch = content.match(markerRegex);
  if (markerMatch?.[1]?.trim()) {
    return markerMatch[1].trim();
  }

  // 回退：旧标题格式（例如 # CRITICAL: Chinese Output Language Rule）
  const headingMatch = content.match(
    /^#.*?CRITICAL:\s*(.*?)\s+Output Language Rule\b/im,
  );
  if (headingMatch?.[1]?.trim()) {
    return headingMatch[1].trim();
  }

  return null;
}

/**
 * 从规则文件读取当前输出语言
 * 如果文件不存在或无法解析则返回 null
 * @returns string | null 输出语言，如果不存在则返回 null
 */
function readOutputLanguageFromFile(): string | null {
  const filePath = getOutputLanguageFilePath();
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseOutputLanguageFromContent(content);
  } catch {
    return null;
  }
}

/**
 * 使用给定语言写入输出语言规则文件
 * @param language - 语言名称
 */
export function writeOutputLanguageFile(language: string): void {
  const filePath = getOutputLanguageFilePath();
  const content = generateOutputLanguageFileContent(language);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * 根据设置值更新 LLM 输出语言规则文件
 * 在写入前将 'auto' 解析为检测到的系统语言
 * @param settingValue - 设置值
 */
export function updateOutputLanguageFile(settingValue: string): void {
  const resolved = resolveOutputLanguage(settingValue);
  writeOutputLanguageFile(resolved);
}

/**
 * 在应用程序启动时初始化 LLM 输出语言规则文件
 * @param outputLanguage - 输出语言设置值（例如 'auto'、'Chinese' 等）
 * 行为：
 * - 解析设置值（'auto' -> 检测到的系统语言，或按原样使用）
 * - 确保规则文件与解析后的语言匹配
 * - 如果文件不存在则创建
 */
export function initializeLlmOutputLanguage(outputLanguage?: string): void {
  // 将 'auto' 或 undefined 解析为检测到的系统语言
  const resolved = resolveOutputLanguage(outputLanguage);
  const currentFileLanguage = readOutputLanguageFromFile();

  // 仅在文件与解析后的语言不匹配时写入
  if (currentFileLanguage !== resolved) {
    writeOutputLanguageFile(resolved);
  }
}
