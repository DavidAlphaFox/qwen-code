/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AuthType,
  type ContentGeneratorConfig,
  type ContentGeneratorConfigSources,
  resolveModelConfig,
  type ModelConfigSourcesInput,
  type ProviderModelConfig,
} from '@qwen-code/qwen-code-core';
import type { Settings } from '../config/settings.js';

/**
 * CLI 生成配置输入接口
 */
export interface CliGenerationConfigInputs {
  argv: {
    model?: string | undefined;
    openaiApiKey?: string | undefined;
    openaiBaseUrl?: string | undefined;
    openaiLogging?: boolean | undefined;
    openaiLoggingDir?: string | undefined;
  };
  settings: Settings;
  selectedAuthType: AuthType | undefined;
  /**
   * 可注入的环境变量，用于测试。默认为调用处的 process.env
   */
  env?: Record<string, string | undefined>;
}

/**
 * 已解析的 CLI 生成配置接口
 */
export interface ResolvedCliGenerationConfig {
  /** 已解析的模型 ID（如果在 CLI 层无法解析可能为空字符串） */
  model: string;
  /** OpenAI 兼容认证的 API 密钥 */
  apiKey: string;
  /** OpenAI 兼容认证的 Base URL */
  baseUrl: string;
  /** 传递给 core Config 的完整生成配置 */
  generationConfig: Partial<ContentGeneratorConfig>;
  /** 每个已解析字段的来源归属 */
  sources: ContentGeneratorConfigSources;
  /** 解析过程中生成的警告 */
  warnings: string[];
}

/**
 * 从环境变量获取认证类型
 * @returns 认证类型枚举值，如果环境变量未设置则返回 undefined
 */
export function getAuthTypeFromEnv(): AuthType | undefined {
  if (process.env['QWEN_OAUTH']) {
    return AuthType.QWEN_OAUTH;
  }

  if (
    process.env['OPENAI_API_KEY'] &&
    process.env['OPENAI_MODEL'] &&
    process.env['OPENAI_BASE_URL']
  ) {
    return AuthType.USE_OPENAI;
  }

  if (process.env['GEMINI_API_KEY'] && process.env['GEMINI_MODEL']) {
    return AuthType.USE_GEMINI;
  }

  if (process.env['GOOGLE_API_KEY'] && process.env['GOOGLE_MODEL']) {
    return AuthType.USE_VERTEX_AI;
  }

  if (
    process.env['ANTHROPIC_API_KEY'] &&
    process.env['ANTHROPIC_MODEL'] &&
    process.env['ANTHROPIC_BASE_URL']
  ) {
    return AuthType.USE_ANTHROPIC;
  }

  return undefined;
}

/**
 * CLI 生成配置的统一解析器
 * 优先级（对于 OpenAI 认证）：
 * - model: argv.model > OPENAI_MODEL > QWEN_MODEL > settings.model.name
 * - apiKey: argv.openaiApiKey > OPENAI_API_KEY > settings.security.auth.apiKey
 * - baseUrl: argv.openaiBaseUrl > OPENAI_BASE_URL > settings.security.auth.baseUrl
 * 对于非 OpenAI 认证，CLI 层只尊重 argv.model 覆盖
 * @param inputs - CLI 生成配置输入
 * @returns 已解析的 CLI 生成配置
 */
export function resolveCliGenerationConfig(
  inputs: CliGenerationConfigInputs,
): ResolvedCliGenerationConfig {
  const { argv, settings, selectedAuthType } = inputs;
  const env = inputs.env ?? (process.env as Record<string, string | undefined>);

  const authType = selectedAuthType;

  // Find modelProvider from settings.modelProviders based on authType and model
  let modelProvider: ProviderModelConfig | undefined;
  if (authType && settings.modelProviders) {
    const providers = settings.modelProviders[authType];
    if (providers && Array.isArray(providers)) {
      // Try to find by requested model (from CLI or settings)
      const requestedModel = argv.model || settings.model?.name;
      if (requestedModel) {
        modelProvider = providers.find((p) => p.id === requestedModel) as
          | ProviderModelConfig
          | undefined;
      }
    }
  }

  const configSources: ModelConfigSourcesInput = {
    authType,
    cli: {
      model: argv.model,
      apiKey: argv.openaiApiKey,
      baseUrl: argv.openaiBaseUrl,
    },
    settings: {
      model: settings.model?.name,
      apiKey: settings.security?.auth?.apiKey,
      baseUrl: settings.security?.auth?.baseUrl,
      generationConfig: settings.model?.generationConfig as
        | Partial<ContentGeneratorConfig>
        | undefined,
    },
    modelProvider,
    env,
  };

  const resolved = resolveModelConfig(configSources);

  // Resolve OpenAI logging config (CLI-specific, not part of core resolver)
  const enableOpenAILogging =
    (typeof argv.openaiLogging === 'undefined'
      ? settings.model?.enableOpenAILogging
      : argv.openaiLogging) ?? false;

  const openAILoggingDir =
    argv.openaiLoggingDir || settings.model?.openAILoggingDir;

  // Build the full generation config
  // Note: we merge the resolved config with logging settings
  const generationConfig: Partial<ContentGeneratorConfig> = {
    ...resolved.config,
    enableOpenAILogging,
    openAILoggingDir,
  };

  return {
    model: resolved.config.model || '',
    apiKey: resolved.config.apiKey || '',
    baseUrl: resolved.config.baseUrl || '',
    generationConfig,
    sources: resolved.sources,
    warnings: resolved.warnings,
  };
}
