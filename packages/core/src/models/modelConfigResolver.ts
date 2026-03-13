/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ModelConfigResolver - 模型相关配置的统一解析器
 *
 * 此模块整合了所有模型配置解析逻辑，
 * 消除了 CLI 和 Core 层之间的重复代码
 *
 * 配置优先级（从高到低）：
 * 1. modelProvider - 来自 ModelProviders 配置的显式选择
 * 2. CLI 参数 - 命令行标志（--model, --openaiApiKey 等）
 * 3. 环境变量 - OPENAI_API_KEY, OPENAI_MODEL 等
 * 4. 设置 - 用户/工作区设置文件
 * 5. 默认值 - 内置默认值
 */

import { AuthType } from '../core/contentGenerator.js';
import type { ContentGeneratorConfig } from '../core/contentGenerator.js';
import { DEFAULT_QWEN_MODEL } from '../config/models.js';
import {
  resolveField,
  resolveOptionalField,
  layer,
  envLayer,
  cliSource,
  settingsSource,
  modelProvidersSource,
  defaultSource,
  computedSource,
  type ConfigSource,
  type ConfigSources,
  type ConfigLayer,
} from '../utils/configResolver.js';
import {
  AUTH_ENV_MAPPINGS,
  DEFAULT_MODELS,
  QWEN_OAUTH_ALLOWED_MODELS,
  MODEL_GENERATION_CONFIG_FIELDS,
} from './constants.js';
import type { ModelConfig as ModelProviderConfig } from './types.js';
export {
  validateModelConfig,
  type ModelConfigValidationResult,
} from '../core/contentGenerator.js';

/**
 * CLI 提供的配置值
 */
export interface ModelConfigCliInput {
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}

/**
 * 设置文件提供的配置值
 */
export interface ModelConfigSettingsInput {
  /** 来自 settings.model.name 的模型名称 */
  model?: string;
  /** 来自 settings.security.auth.apiKey 的 API 密钥 */
  apiKey?: string;
  /** 来自 settings.security.auth.baseUrl 的基础 URL */
  baseUrl?: string;
  /** 来自 settings.model.generationConfig 的生成配置 */
  generationConfig?: Partial<ContentGeneratorConfig>;
}

/**
 * 模型配置解析的所有输入源
 */
export interface ModelConfigSourcesInput {
  /** 认证类型 */
  authType?: AuthType;

  /** CLI 参数（用户提供的值具有最高优先级） */
  cli?: ModelConfigCliInput;

  /** 设置文件配置 */
  settings?: ModelConfigSettingsInput;

  /** 环境变量（为了可测试性而注入） */
  env: Record<string, string | undefined>;

  /** 来自 ModelProviders 的模型（显式选择，最高优先级） */
  modelProvider?: ModelProviderConfig;

  /** 代理 URL（从 Config 计算） */
  proxy?: string;
}

/**
 * 模型配置解析的结果
 */
export interface ModelConfigResolutionResult {
  /** 完全解析后的配置 */
  config: ContentGeneratorConfig;
  /** 每个字段的来源归属 */
  sources: ConfigSources;
  /** 解析过程中生成的警告 */
  warnings: string[];
}

/**
 * 从所有输入源解析模型配置
 *
 * 这是模型配置解析的单一入口点
 * 它替换了以下位置的重复逻辑：
 * - packages/cli/src/utils/modelProviderUtils.ts (resolveCliGenerationConfig)
 * - packages/core/src/core/contentGenerator.ts (resolveContentGeneratorConfigWithSources)
 *
 * @param input - 所有配置源
 * @returns 带有源跟踪的解析后配置
 */
export function resolveModelConfig(
  input: ModelConfigSourcesInput,
): ModelConfigResolutionResult {
  const { authType, cli, settings, env, modelProvider, proxy } = input;
  const warnings: string[] = [];
  const sources: ConfigSources = {};

  // Special handling for Qwen OAuth
  if (authType === AuthType.QWEN_OAUTH) {
    return resolveQwenOAuthConfig(input, warnings);
  }

  // Get auth-specific env var mappings.
  // If authType is not provided, do not read any auth env vars.
  const envMapping = authType
    ? AUTH_ENV_MAPPINGS[authType]
    : { model: [], apiKey: [], baseUrl: [] };

  // Build layers for each field in priority order
  // Priority: modelProvider > cli > env > settings > default

  // ---- Model ----
  const modelLayers: Array<ConfigLayer<string>> = [];

  if (authType && modelProvider) {
    modelLayers.push(
      layer(
        modelProvider.id,
        modelProvidersSource(authType, modelProvider.id, 'model.id'),
      ),
    );
  }
  if (cli?.model) {
    modelLayers.push(layer(cli.model, cliSource('--model')));
  }
  for (const envKey of envMapping.model) {
    modelLayers.push(envLayer(env, envKey));
  }
  if (settings?.model) {
    modelLayers.push(layer(settings.model, settingsSource('model.name')));
  }

  const defaultModel = authType ? DEFAULT_MODELS[authType] : '';
  const modelResult = resolveField(
    modelLayers,
    defaultModel,
    defaultSource(defaultModel),
  );
  sources['model'] = modelResult.source;

  // ---- API Key ----
  const apiKeyLayers: Array<ConfigLayer<string>> = [];

  // For modelProvider, read from the specified envKey
  if (authType && modelProvider?.envKey) {
    const apiKeyFromEnv = env[modelProvider.envKey];
    if (apiKeyFromEnv) {
      apiKeyLayers.push(
        layer(apiKeyFromEnv, {
          kind: 'env',
          envKey: modelProvider.envKey,
          via: modelProvidersSource(authType, modelProvider.id, 'envKey'),
        }),
      );
    }
  }
  if (cli?.apiKey) {
    apiKeyLayers.push(layer(cli.apiKey, cliSource('--openaiApiKey')));
  }
  for (const envKey of envMapping.apiKey) {
    apiKeyLayers.push(envLayer(env, envKey));
  }
  if (settings?.apiKey) {
    apiKeyLayers.push(
      layer(settings.apiKey, settingsSource('security.auth.apiKey')),
    );
  }

  const apiKeyResult = resolveOptionalField(apiKeyLayers);
  if (apiKeyResult) {
    sources['apiKey'] = apiKeyResult.source;
  }

  // ---- Base URL ----
  const baseUrlLayers: Array<ConfigLayer<string>> = [];

  if (authType && modelProvider?.baseUrl) {
    baseUrlLayers.push(
      layer(
        modelProvider.baseUrl,
        modelProvidersSource(authType, modelProvider.id, 'baseUrl'),
      ),
    );
  }
  if (cli?.baseUrl) {
    baseUrlLayers.push(layer(cli.baseUrl, cliSource('--openaiBaseUrl')));
  }
  for (const envKey of envMapping.baseUrl) {
    baseUrlLayers.push(envLayer(env, envKey));
  }
  if (settings?.baseUrl) {
    baseUrlLayers.push(
      layer(settings.baseUrl, settingsSource('security.auth.baseUrl')),
    );
  }

  const baseUrlResult = resolveOptionalField(baseUrlLayers);
  if (baseUrlResult) {
    sources['baseUrl'] = baseUrlResult.source;
  }

  // ---- API Key Env Key (for error messages) ----
  let apiKeyEnvKey: string | undefined;
  if (authType && modelProvider?.envKey) {
    apiKeyEnvKey = modelProvider.envKey;
    sources['apiKeyEnvKey'] = modelProvidersSource(
      authType,
      modelProvider.id,
      'envKey',
    );
  }

  // ---- Generation Config (from settings or modelProvider) ----
  const generationConfig = resolveGenerationConfig(
    settings?.generationConfig,
    modelProvider?.generationConfig,
    authType,
    modelProvider?.id,
    sources,
  );

  // Build final config
  const config: ContentGeneratorConfig = {
    authType,
    model: modelResult.value || '',
    apiKey: apiKeyResult?.value,
    apiKeyEnvKey,
    baseUrl: baseUrlResult?.value,
    proxy,
    ...generationConfig,
  };

  // Add proxy source
  if (proxy) {
    sources['proxy'] = computedSource('Config.getProxy()');
  }

  // Add authType source
  sources['authType'] = computedSource('provided by caller');

  return { config, sources, warnings };
}

/**
 * Qwen OAuth 认证的特殊解析器
 * Qwen OAuth 具有固定的模型选项并使用动态令牌
 */
function resolveQwenOAuthConfig(
  input: ModelConfigSourcesInput,
  warnings: string[],
): ModelConfigResolutionResult {
  const { cli, settings, proxy, modelProvider } = input;
  const sources: ConfigSources = {};

  // Qwen OAuth only allows specific models
  const allowedModels = new Set<string>(QWEN_OAUTH_ALLOWED_MODELS);

  // Determine requested model
  const requestedModel = cli?.model || settings?.model;
  let resolvedModel: string;
  let modelSource: ConfigSource;

  if (requestedModel && allowedModels.has(requestedModel)) {
    resolvedModel = requestedModel;
    modelSource = cli?.model
      ? cliSource('--model')
      : settingsSource('model.name');
  } else {
    if (requestedModel) {
      const isVisionModel =
        requestedModel.includes('vl') || requestedModel.includes('vision');
      const extraMessage = isVisionModel
        ? ` Note: vision-model has been removed since coder-model now supports vision capabilities.`
        : '';
      warnings.push(
        `Warning: Unsupported Qwen OAuth model '${requestedModel}', falling back to '${DEFAULT_QWEN_MODEL}'.${extraMessage}`,
      );
    }
    resolvedModel = DEFAULT_QWEN_MODEL;
    modelSource = defaultSource(`fallback to '${DEFAULT_QWEN_MODEL}'`);
  }

  sources['model'] = modelSource;
  sources['apiKey'] = computedSource('Qwen OAuth dynamic token');
  sources['authType'] = computedSource('provided by caller');

  if (proxy) {
    sources['proxy'] = computedSource('Config.getProxy()');
  }

  // Resolve generation config from settings and modelProvider
  const generationConfig = resolveGenerationConfig(
    settings?.generationConfig,
    modelProvider?.generationConfig,
    AuthType.QWEN_OAUTH,
    resolvedModel,
    sources,
  );

  const config: ContentGeneratorConfig = {
    authType: AuthType.QWEN_OAUTH,
    model: resolvedModel,
    apiKey: 'QWEN_OAUTH_DYNAMIC_TOKEN',
    proxy,
    ...generationConfig,
  };

  return { config, sources, warnings };
}

/**
 * 解析生成配置字段（samplingParams、timeout 等）
 * @param settingsConfig - 来自设置文件的配置
 * @param modelProviderConfig - 来自模型提供者的配置
 * @param authType - 认证类型
 * @param modelId - 模型 ID
 * @param sources - 配置源跟踪对象
 * @returns 解析后的生成配置
 */
function resolveGenerationConfig(
  settingsConfig: Partial<ContentGeneratorConfig> | undefined,
  modelProviderConfig: Partial<ContentGeneratorConfig> | undefined,
  authType: AuthType | undefined,
  modelId: string | undefined,
  sources: ConfigSources,
): Partial<ContentGeneratorConfig> {
  const result: Partial<ContentGeneratorConfig> = {};

  for (const field of MODEL_GENERATION_CONFIG_FIELDS) {
    // ModelProvider config takes priority over settings config
    if (authType && modelProviderConfig && field in modelProviderConfig) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (result as any)[field] = modelProviderConfig[field];
      sources[field] = modelProvidersSource(
        authType,
        modelId || '',
        `generationConfig.${field}`,
      );
    } else if (settingsConfig && field in settingsConfig) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (result as any)[field] = settingsConfig[field];
      sources[field] = settingsSource(`model.generationConfig.${field}`);
    }
  }

  return result;
}
