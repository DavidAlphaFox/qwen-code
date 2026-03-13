/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@qwen-code/qwen-code-core';
import type { WebSearchProviderConfig } from '@qwen-code/qwen-code-core';
import type { Settings } from './settings.js';

/**
 * 与网络搜索配置相关的 CLI 参数
 */
export interface WebSearchCliArgs {
  tavilyApiKey?: string;
  googleApiKey?: string;
  googleSearchEngineId?: string;
  webSearchDefault?: string;
}

/**
 * 网络搜索配置结构
 */
export interface WebSearchConfig {
  provider: WebSearchProviderConfig[];
  default: string;
}

/**
 * 从多个来源构建网络搜索配置，优先级如下：
 * 1. settings.json（新格式）- 最高优先级
 * 2. 命令行参数 + 环境变量
 * 3. 传统的 tavilyApiKey（向后兼容）
 * @param argv - 命令行参数
 * @param settings - 来自 settings.json 的用户设置
 * @param authType - 认证类型（例如 'qwen-oauth'）
 * @returns 网络搜索配置，如果没有可用提供商则返回 undefined
 */
export function buildWebSearchConfig(
  argv: WebSearchCliArgs,
  settings: Settings,
  authType?: string,
): WebSearchConfig | undefined {
  const isQwenOAuth = authType === AuthType.QWEN_OAUTH;

  // Step 1: Collect providers from settings or command line/env
  let providers: WebSearchProviderConfig[] = [];
  let userDefault: string | undefined;

  if (settings.webSearch) {
    // Use providers from settings.json
    providers = [...settings.webSearch.provider];
    userDefault = settings.webSearch.default;
  } else {
    // Build providers from command line args and environment variables
    const tavilyKey =
      argv.tavilyApiKey ||
      settings.advanced?.tavilyApiKey ||
      process.env['TAVILY_API_KEY'];
    if (tavilyKey) {
      providers.push({
        type: 'tavily',
        apiKey: tavilyKey,
      } as WebSearchProviderConfig);
    }

    const googleKey = argv.googleApiKey || process.env['GOOGLE_API_KEY'];
    const googleEngineId =
      argv.googleSearchEngineId || process.env['GOOGLE_SEARCH_ENGINE_ID'];
    if (googleKey && googleEngineId) {
      providers.push({
        type: 'google',
        apiKey: googleKey,
        searchEngineId: googleEngineId,
      } as WebSearchProviderConfig);
    }
  }

  // Step 2: Ensure dashscope is available for qwen-oauth users
  if (isQwenOAuth) {
    const hasDashscope = providers.some((p) => p.type === 'dashscope');
    if (!hasDashscope) {
      providers.push({ type: 'dashscope' } as WebSearchProviderConfig);
    }
  }

  // Step 3: If no providers available, return undefined
  if (providers.length === 0) {
    return undefined;
  }

  // Step 4: Determine default provider
  // Priority: user explicit config > CLI arg > first available provider (tavily > google > dashscope)
  const providerPriority: Array<'tavily' | 'google' | 'dashscope'> = [
    'tavily',
    'google',
    'dashscope',
  ];

  // Determine default provider based on availability
  let defaultProvider = userDefault || argv.webSearchDefault;
  if (!defaultProvider) {
    // Find first available provider by priority order
    for (const providerType of providerPriority) {
      if (providers.some((p) => p.type === providerType)) {
        defaultProvider = providerType;
        break;
      }
    }
    // Fallback to first available provider if none found in priority list
    if (!defaultProvider) {
      defaultProvider = providers[0]?.type || 'dashscope';
    }
  }

  return {
    provider: providers,
    default: defaultProvider,
  };
}
