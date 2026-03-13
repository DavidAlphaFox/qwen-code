/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';
import os from 'node:os';
import { execSync } from 'node:child_process';
import type { CommandContext } from '../ui/commands/types.js';
import { getCliVersion } from './version.js';
import { IdeClient, AuthType } from '@qwen-code/qwen-code-core';
import { formatMemoryUsage } from '../ui/utils/formatters.js';
import { GIT_COMMIT_INFO } from '../generated/git-commit.js';

/**
 * 系统信息接口
 * 包含可用于调试和报告的所有系统相关详细信息
 */
export interface SystemInfo {
  /** CLI 版本 */
  cliVersion: string;
  /** 操作系统平台 */
  osPlatform: string;
  /** 操作系统架构 */
  osArch: string;
  /** 操作系统版本 */
  osRelease: string;
  /** Node.js 版本 */
  nodeVersion: string;
  /** NPM 版本 */
  npmVersion: string;
  /** 沙箱环境 */
  sandboxEnv: string;
  /** 模型版本 */
  modelVersion: string;
  /** 选定的认证类型 */
  selectedAuthType: string;
  /** IDE 客户端 */
  ideClient: string;
  /** 会话 ID */
  sessionId: string;
  /** 代理（可选） */
  proxy?: string;
}

/**
 * 扩展系统信息（用于错误报告）
 */
export interface ExtendedSystemInfo extends SystemInfo {
  /** 内存使用情况 */
  memoryUsage: string;
  /** 基础 URL（可选） */
  baseUrl?: string;
  /** API 密钥环境变量名（可选） */
  apiKeyEnvKey?: string;
  /** Git 提交信息（可选） */
  gitCommit?: string;
  /** 代理（可选） */
  proxy?: string;
}

/**
 * 获取 NPM 版本
 * 处理 npm 可能不可用的情况
 * 如果 npm 命令失败或未找到则返回 'unknown'
 * @returns Promise<string> NPM 版本字符串
 */
export async function getNpmVersion(): Promise<string> {
  try {
    return execSync('npm --version', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * 获取 IDE 客户端名称（如果 IDE 模式已启用）
 * 如果 IDE 模式禁用或未检测到 IDE 客户端则返回空字符串
 * @param context - 命令上下文
 * @returns Promise<string> IDE 客户端名称
 */
export async function getIdeClientName(
  context: CommandContext,
): Promise<string> {
  if (!context.services.config?.getIdeMode()) {
    return '';
  }
  try {
    const ideClient = await IdeClient.getInstance();
    return ideClient?.getDetectedIdeDisplayName() ?? '';
  } catch {
    return '';
  }
}

/**
 * 获取沙箱环境信息
 * 处理不同类型的沙箱环境，包括 sandbox-exec 和自定义沙箱
 * 对于错误报告，从沙箱名称中移除 'qwen-' 或 'qwen-code-' 前缀
 * @param stripPrefix - 是否移除 'qwen-' 前缀（用于错误报告）
 * @returns string 沙箱环境信息
 */
export function getSandboxEnv(stripPrefix = false): string {
  const sandbox = process.env['SANDBOX'];

  if (!sandbox || sandbox === 'sandbox-exec') {
    if (sandbox === 'sandbox-exec') {
      const profile = process.env['SEATBELT_PROFILE'] || 'unknown';
      return `sandbox-exec (${profile})`;
    }
    return 'no sandbox';
  }

  // 对于错误报告，移除 qwen- 前缀
  if (stripPrefix) {
    return sandbox.replace(/^qwen-(?:code-)?/, '');
  }

  return sandbox;
}

/**
 * 收集综合系统信息用于调试和报告
 * 此函数收集所有系统相关信息，包括操作系统、版本、沙箱环境、认证和会话信息
 * @param context - 包含配置和设置的命令上下文
 * @returns Promise<SystemInfo> 包含所有收集信息的 SystemInfo 对象
 */
export async function getSystemInfo(
  context: CommandContext,
): Promise<SystemInfo> {
  const osPlatform = process.platform;
  const osArch = process.arch;
  const osRelease = os.release();
  const nodeVersion = process.version;
  const npmVersion = await getNpmVersion();
  const sandboxEnv = getSandboxEnv();
  const modelVersion = context.services.config?.getModel() || 'Unknown';
  const cliVersion = await getCliVersion();
  const selectedAuthType = context.services.config?.getAuthType() || '';
  const ideClient = await getIdeClientName(context);
  const sessionId = context.services.config?.getSessionId() || 'unknown';
  const proxy = context.services.config?.getProxy();

  return {
    cliVersion,
    osPlatform,
    osArch,
    osRelease,
    nodeVersion,
    npmVersion,
    sandboxEnv,
    modelVersion,
    selectedAuthType,
    ideClient,
    sessionId,
    proxy,
  };
}

/**
 * 收集扩展系统信息用于错误报告
 * 包含所有标准系统信息以及内存使用情况和可选的基础 URL
 * @param context - 包含配置和设置的命令上下文
 * @returns Promise<ExtendedSystemInfo> ExtendedSystemInfo 对象
 */
export async function getExtendedSystemInfo(
  context: CommandContext,
): Promise<ExtendedSystemInfo> {
  const baseInfo = await getSystemInfo(context);
  const memoryUsage = formatMemoryUsage(process.memoryUsage().rss);

  // 对于错误报告，使用不带前缀的沙箱名称
  const sandboxEnv = getSandboxEnv(true);

  // 如果使用 OpenAI 或 Anthropic 认证，获取基础 URL 和 apiKeyEnvKey
  const contentGeneratorConfig =
    baseInfo.selectedAuthType === AuthType.USE_OPENAI ||
    baseInfo.selectedAuthType === AuthType.USE_ANTHROPIC
      ? context.services.config?.getContentGeneratorConfig()
      : undefined;
  const baseUrl = contentGeneratorConfig?.baseUrl;
  const apiKeyEnvKey = contentGeneratorConfig?.apiKeyEnvKey;

  // 获取 git 提交信息
  const gitCommit =
    GIT_COMMIT_INFO && !['N/A'].includes(GIT_COMMIT_INFO)
      ? GIT_COMMIT_INFO
      : undefined;

  return {
    ...baseInfo,
    sandboxEnv,
    memoryUsage,
    baseUrl,
    apiKeyEnvKey,
    gitCommit,
  };
}
