/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
  GenerateContentParameters,
  GenerateContentResponse,
} from '@google/genai';
import type { Config } from '../config/config.js';
import { LoggingContentGenerator } from './loggingContentGenerator/index.js';
import type {
  ConfigSource,
  ConfigSourceKind,
  ConfigSources,
} from '../utils/configResolver.js';
import {
  getDefaultApiKeyEnvVar,
  getDefaultModelEnvVar,
  MissingAnthropicBaseUrlEnvError,
  MissingApiKeyError,
  MissingBaseUrlError,
  MissingModelError,
  StrictMissingCredentialsError,
  StrictMissingModelIdError,
} from '../models/modelConfigErrors.js';
import { PROVIDER_SOURCED_FIELDS } from '../models/modelsConfig.js';

/**
 * 接口，抽象生成内容和计数令牌的核心功能
 */
export interface ContentGenerator {
  /**
   * 生成内容
   * @param request - 生成内容参数
   * @param userPromptId - 用户提示 ID
   * @returns 生成内容响应
   */
  generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse>;

  /**
   * 生成内容流
   * @param request - 生成内容参数
   * @param userPromptId - 用户提示 ID
   * @returns 生成内容响应的异步生成器
   */
  generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>>;

  /**
   * 计数令牌
   * @param request - 计数令牌参数
   * @returns 计数令牌响应
   */
  countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;

  /**
   * 嵌入内容
   * @param request - 嵌入内容参数
   * @returns 嵌入内容响应
   */
  embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;

  /**
   * 使用总结思考
   * @returns 是否使用总结思考
   */
  useSummarizedThinking(): boolean;
}

/**
 * 认证类型枚举
 */
export enum AuthType {
  /** OpenAI */
  USE_OPENAI = 'openai',
  /** Qwen OAuth */
  QWEN_OAUTH = 'qwen-oauth',
  /** Gemini */
  USE_GEMINI = 'gemini',
  /** Vertex AI */
  USE_VERTEX_AI = 'vertex-ai',
  /** Anthropic */
  USE_ANTHROPIC = 'anthropic',
}

/**
 * 模型支持的输入模态
 * 省略或为 false 的字段表示模型不支持该输入类型
 */
export type InputModalities = {
  /** 图片支持 */
  image?: boolean;
  /** PDF 支持 */
  pdf?: boolean;
  /** 音频支持 */
  audio?: boolean;
  /** 视频支持 */
  video?: boolean;
};

/**
 * 内容生成器配置
 */
export type ContentGeneratorConfig = {
  /** 模型名称 */
  model: string;
  /** API 密钥 */
  apiKey?: string;
  /** API 密钥环境变量名 */
  apiKeyEnvKey?: string;
  /** 基础 URL */
  baseUrl?: string;
  /** 是否使用 Vertex AI */
  vertexai?: boolean;
  /** 认证类型 */
  authType?: AuthType | undefined;
  /** 启用 OpenAI 日志记录 */
  enableOpenAILogging?: boolean;
  /** OpenAI 日志目录 */
  openAILoggingDir?: string;
  /** 超时配置（毫秒） */
  timeout?: number;
  /** 速率限制错误的最大重试次数 */
  maxRetries?: number;
  /** 触发速率限制重试的其他错误码 */
  retryErrorCodes?: number[];
  /** 为 DashScope 提供商启用缓存控制 */
  enableCacheControl?: boolean;
  /** 采样参数 */
  samplingParams?: {
    /** top_p 采样 */
    top_p?: number;
    /** top_k 采样 */
    top_k?: number;
    /** 重复惩罚 */
    repetition_penalty?: number;
    /** 存在惩罚 */
    presence_penalty?: number;
    /** 频率惩罚 */
    frequency_penalty?: number;
    /** 温度 */
    temperature?: number;
    /** 最大令牌数 */
    max_tokens?: number;
  };
  /** 推理配置 */
  reasoning?:
    | false
    | {
        /** 努力程度 */
        effort?: 'low' | 'medium' | 'high';
        /** 令牌预算 */
        budget_tokens?: number;
      };
  /** 代理 URL */
  proxy?: string | undefined;
  /** 用户代理 */
  userAgent?: string;
  /** 工具定义的 Schema 合规模式 */
  schemaCompliance?: 'auto' | 'openapi_30';
  /** 上下文窗口大小覆盖。如果设置为正数，它将覆盖自动检测。留空以使用自动检测 */
  contextWindowSize?: number;
  /** 与请求一起发送的自定义 HTTP 头 */
  customHeaders?: Record<string, string>;
  /** 要合并到请求正文的额外参数 */
  extra_body?: Record<string, unknown>;
  // Supported input modalities. Unsupported media types are replaced with text
  // placeholders. Leave undefined to use automatic detection from model name.
  modalities?: InputModalities;
};

// Keep the public ContentGeneratorConfigSources API, but reuse the generic
// source-tracking types from utils/configResolver to avoid duplication.
export type ContentGeneratorConfigSourceKind = ConfigSourceKind;
export type ContentGeneratorConfigSource = ConfigSource;
export type ContentGeneratorConfigSources = ConfigSources;

export type ResolvedContentGeneratorConfig = {
  config: ContentGeneratorConfig;
  sources: ContentGeneratorConfigSources;
};

function setSource(
  sources: ContentGeneratorConfigSources,
  path: string,
  source: ContentGeneratorConfigSource,
): void {
  sources[path] = source;
}

function getSeedSource(
  seed: ContentGeneratorConfigSources | undefined,
  path: string,
): ContentGeneratorConfigSource | undefined {
  return seed?.[path];
}

/**
 * Resolve ContentGeneratorConfig while tracking the source of each effective field.
 *
 * This function now primarily validates and finalizes the configuration that has
 * already been resolved by ModelConfigResolver. The env fallback logic has been
 * moved to the unified resolver to eliminate duplication.
 *
 * Note: The generationConfig passed here should already be fully resolved with
 * proper source tracking from the caller (CLI/SDK layer).
 */
export function resolveContentGeneratorConfigWithSources(
  config: Config,
  authType: AuthType | undefined,
  generationConfig?: Partial<ContentGeneratorConfig>,
  seedSources?: ContentGeneratorConfigSources,
  options?: { strictModelProvider?: boolean },
): ResolvedContentGeneratorConfig {
  const sources: ContentGeneratorConfigSources = { ...(seedSources || {}) };
  const strictModelProvider = options?.strictModelProvider === true;

  // Build config with computed fields
  const newContentGeneratorConfig: Partial<ContentGeneratorConfig> = {
    ...(generationConfig || {}),
    authType,
    proxy: config?.getProxy(),
  };

  // Set sources for computed fields
  setSource(sources, 'authType', {
    kind: 'computed',
    detail: 'provided by caller',
  });
  if (config?.getProxy()) {
    setSource(sources, 'proxy', {
      kind: 'computed',
      detail: 'Config.getProxy()',
    });
  }

  // Preserve seed sources for fields that were passed in
  const seedOrUnknown = (path: string): ContentGeneratorConfigSource =>
    getSeedSource(seedSources, path) ?? { kind: 'unknown' };

  for (const field of PROVIDER_SOURCED_FIELDS) {
    if (generationConfig && field in generationConfig && !sources[field]) {
      setSource(sources, field, seedOrUnknown(field));
    }
  }

  // Validate required fields based on authType. This does not perform any
  // fallback resolution (resolution is handled by ModelConfigResolver).
  const validation = validateModelConfig(
    newContentGeneratorConfig as ContentGeneratorConfig,
    strictModelProvider,
  );
  if (!validation.valid) {
    throw new Error(validation.errors.map((e) => e.message).join('\n'));
  }

  return {
    config: newContentGeneratorConfig as ContentGeneratorConfig,
    sources,
  };
}

export interface ModelConfigValidationResult {
  valid: boolean;
  errors: Error[];
}

/**
 * Validate a resolved model configuration.
 * This is the single validation entry point used across Core.
 */
export function validateModelConfig(
  config: ContentGeneratorConfig,
  isStrictModelProvider: boolean = false,
): ModelConfigValidationResult {
  const errors: Error[] = [];

  // Qwen OAuth doesn't need validation - it uses dynamic tokens
  if (config.authType === AuthType.QWEN_OAUTH) {
    return { valid: true, errors: [] };
  }

  // API key is required for all other auth types
  if (!config.apiKey) {
    if (isStrictModelProvider) {
      errors.push(
        new StrictMissingCredentialsError(
          config.authType,
          config.model,
          config.apiKeyEnvKey,
        ),
      );
    } else {
      const envKey =
        config.apiKeyEnvKey || getDefaultApiKeyEnvVar(config.authType);
      errors.push(
        new MissingApiKeyError({
          authType: config.authType,
          model: config.model,
          baseUrl: config.baseUrl,
          envKey,
        }),
      );
    }
  }

  // Model is required
  if (!config.model) {
    if (isStrictModelProvider) {
      errors.push(new StrictMissingModelIdError(config.authType));
    } else {
      const envKey = getDefaultModelEnvVar(config.authType);
      errors.push(new MissingModelError({ authType: config.authType, envKey }));
    }
  }

  // Explicit baseUrl is required for Anthropic; Migrated from existing code.
  if (config.authType === AuthType.USE_ANTHROPIC && !config.baseUrl) {
    if (isStrictModelProvider) {
      errors.push(
        new MissingBaseUrlError({
          authType: config.authType,
          model: config.model,
        }),
      );
    } else if (config.authType === AuthType.USE_ANTHROPIC) {
      errors.push(new MissingAnthropicBaseUrlEnvError());
    }
  }

  return { valid: errors.length === 0, errors };
}

export function createContentGeneratorConfig(
  config: Config,
  authType: AuthType | undefined,
  generationConfig?: Partial<ContentGeneratorConfig>,
): ContentGeneratorConfig {
  return resolveContentGeneratorConfigWithSources(
    config,
    authType,
    generationConfig,
  ).config;
}

export async function createContentGenerator(
  generatorConfig: ContentGeneratorConfig,
  config: Config,
  isInitialAuth?: boolean,
): Promise<ContentGenerator> {
  const validation = validateModelConfig(generatorConfig, false);
  if (!validation.valid) {
    throw new Error(validation.errors.map((e) => e.message).join('\n'));
  }

  const authType = generatorConfig.authType;
  if (!authType) {
    throw new Error('ContentGeneratorConfig must have an authType');
  }

  let baseGenerator: ContentGenerator;

  if (authType === AuthType.USE_OPENAI) {
    const { createOpenAIContentGenerator } =
      await import('./openaiContentGenerator/index.js');
    baseGenerator = createOpenAIContentGenerator(generatorConfig, config);
  } else if (authType === AuthType.QWEN_OAUTH) {
    const { getQwenOAuthClient: getQwenOauthClient } =
      await import('../qwen/qwenOAuth2.js');
    const { QwenContentGenerator } =
      await import('../qwen/qwenContentGenerator.js');

    try {
      const qwenClient = await getQwenOauthClient(
        config,
        isInitialAuth ? { requireCachedCredentials: true } : undefined,
      );
      baseGenerator = new QwenContentGenerator(
        qwenClient,
        generatorConfig,
        config,
      );
    } catch (error) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } else if (authType === AuthType.USE_ANTHROPIC) {
    const { createAnthropicContentGenerator } =
      await import('./anthropicContentGenerator/index.js');
    baseGenerator = createAnthropicContentGenerator(generatorConfig, config);
  } else if (
    authType === AuthType.USE_GEMINI ||
    authType === AuthType.USE_VERTEX_AI
  ) {
    const { createGeminiContentGenerator } =
      await import('./geminiContentGenerator/index.js');
    baseGenerator = createGeminiContentGenerator(generatorConfig, config);
  } else {
    throw new Error(
      `Error creating contentGenerator: Unsupported authType: ${authType}`,
    );
  }

  return new LoggingContentGenerator(baseGenerator, config, generatorConfig);
}
