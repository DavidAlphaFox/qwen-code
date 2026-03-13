/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LspCodeActionKind, LspDiagnosticSeverity } from './types.js';

// ============================================================================
// 超时常量
// ============================================================================

/** LSP 服务器启动默认超时（毫秒） */
export const DEFAULT_LSP_STARTUP_TIMEOUT_MS = 10000;

/** LSP 请求默认超时（毫秒） */
export const DEFAULT_LSP_REQUEST_TIMEOUT_MS = 15000;

/** TypeScript 服务器预热默认延迟（毫秒） */
export const DEFAULT_LSP_WARMUP_DELAY_MS = 150;

/** 命令存在性检查默认超时（毫秒） */
export const DEFAULT_LSP_COMMAND_CHECK_TIMEOUT_MS = 2000;

// ============================================================================
// 重试常量
// ============================================================================

/** 服务器重启默认最大尝试次数 */
export const DEFAULT_LSP_MAX_RESTARTS = 3;

/** 套接字连接重试之间默认初始延迟（毫秒） */
export const DEFAULT_LSP_SOCKET_RETRY_DELAY_MS = 250;

/** 套接字连接重试之间默认最大延迟（毫秒） */
export const DEFAULT_LSP_SOCKET_MAX_RETRY_DELAY_MS = 1000;

// ============================================================================
// LSP 协议标签
// ============================================================================

/**
 * 符号类型标签，用于将数字 LSP SymbolKind 转换为可读字符串
 * 基于 LSP 规范：https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#symbolKind
 */
export const SYMBOL_KIND_LABELS: Record<number, string> = {
  1: 'File',
  2: 'Module',
  3: 'Namespace',
  4: 'Package',
  5: 'Class',
  6: 'Method',
  7: 'Property',
  8: 'Field',
  9: 'Constructor',
  10: 'Enum',
  11: 'Interface',
  12: 'Function',
  13: 'Variable',
  14: 'Constant',
  15: 'String',
  16: 'Number',
  17: 'Boolean',
  18: 'Array',
  19: 'Object',
  20: 'Key',
  21: 'Null',
  22: 'EnumMember',
  23: 'Struct',
  24: 'Event',
  25: 'Operator',
  26: 'TypeParameter',
};

/**
 * 诊断严重性标签，用于将数字 LSP DiagnosticSeverity 转换为可读字符串
 * 基于 LSP 规范
 */
export const DIAGNOSTIC_SEVERITY_LABELS: Record<number, LspDiagnosticSeverity> =
  {
    1: 'error',
    2: 'warning',
    3: 'information',
    4: 'hint',
  };

/**
 * 来自 LSP 规范的代码操作类型标签
 */
export const CODE_ACTION_KIND_LABELS: Record<string, LspCodeActionKind> = {
  '': 'quickfix',
  quickfix: 'quickfix',
  refactor: 'refactor',
  'refactor.extract': 'refactor.extract',
  'refactor.inline': 'refactor.inline',
  'refactor.rewrite': 'refactor.rewrite',
  source: 'source',
  'source.organizeImports': 'source.organizeImports',
  'source.fixAll': 'source.fixAll',
};
