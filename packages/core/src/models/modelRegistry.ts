/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '../core/contentGenerator.js';
import { defaultModalities } from '../core/modalityDefaults.js';
import { tokenLimit } from '../core/tokenLimits.js';
import { DEFAULT_OPENAI_BASE_URL } from '../core/openaiContentGenerator/constants.js';
import {
  type ModelConfig,
  type ModelProvidersConfig,
  type ResolvedModelConfig,
  type AvailableModel,
} from './types.js';
import { DEFAULT_QWEN_MODEL } from '../config/models.js';
import { QWEN_OAUTH_MODELS } from './constants.js';
import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('MODEL_REGISTRY');

export { QWEN_OAUTH_MODELS } from './constants.js';

/**
 * 验证字符串键是否为有效的 AuthType 枚举值
 * @param key - 要验证的键
 * @returns 验证后的 AuthType，如果无效则返回 undefined
 */
function validateAuthTypeKey(key: string): AuthType | undefined {
  // Check if the key is a valid AuthType enum value
  if (Object.values(AuthType).includes(key as AuthType)) {
    return key as AuthType;
  }

  // Invalid key
  return undefined;
}

/**
 * 模型配置注册表
 * 模型按 authType（认证类型）组织
 */
export class ModelRegistry {
  private modelsByAuthType: Map<AuthType, Map<string, ResolvedModelConfig>>;

  private getDefaultBaseUrl(authType: AuthType): string {
    switch (authType) {
      case AuthType.QWEN_OAUTH:
        return 'DYNAMIC_QWEN_OAUTH_BASE_URL';
      case AuthType.USE_OPENAI:
        return DEFAULT_OPENAI_BASE_URL;
      default:
        return '';
    }
  }

  constructor(modelProvidersConfig?: ModelProvidersConfig) {
    this.modelsByAuthType = new Map();

    // Always register qwen-oauth models (hard-coded, cannot be overridden)
    this.registerAuthTypeModels(AuthType.QWEN_OAUTH, QWEN_OAUTH_MODELS);

    // Register user-configured models for other authTypes
    if (modelProvidersConfig) {
      for (const [rawKey, models] of Object.entries(modelProvidersConfig)) {
        const authType = validateAuthTypeKey(rawKey);

        if (!authType) {
          debugLogger.warn(
            `Invalid authType key "${rawKey}" in modelProviders config. Expected one of: ${Object.values(AuthType).join(', ')}. Skipping.`,
          );
          continue;
        }

        // Skip qwen-oauth as it uses hard-coded models
        if (authType === AuthType.QWEN_OAUTH) {
          continue;
        }

        this.registerAuthTypeModels(authType, models);
      }
    }
  }

  /**
   * 为指定 authType 注册模型
   * 如果多个模型具有相同的 id，则优先使用第一个注册的模型
   * @param authType - 认证类型
   * @param models - 模型配置数组
   */
  private registerAuthTypeModels(
    authType: AuthType,
    models: ModelConfig[],
  ): void {
    const modelMap = new Map<string, ResolvedModelConfig>();

    for (const config of models) {
      // Skip if a model with the same id is already registered (first one wins)
      if (modelMap.has(config.id)) {
        debugLogger.warn(
          `Duplicate model id "${config.id}" for authType "${authType}". Using the first registered config.`,
        );
        continue;
      }
      const resolved = this.resolveModelConfig(config, authType);
      modelMap.set(config.id, resolved);
    }

    this.modelsByAuthType.set(authType, modelMap);
  }

  /**
   * 获取指定 authType 的所有模型
   * 用于 /model 命令仅显示相关模型
   * @param authType - 认证类型
   * @returns 可用模型数组
   */
  getModelsForAuthType(authType: AuthType): AvailableModel[] {
    const models = this.modelsByAuthType.get(authType);
    if (!models) return [];

    return Array.from(models.values()).map((model) => ({
      id: model.id,
      label: model.name,
      description: model.description,
      capabilities: model.capabilities,
      authType: model.authType,
      isVision: model.capabilities?.vision ?? false,
      contextWindowSize:
        model.generationConfig.contextWindowSize ?? tokenLimit(model.id),
      modalities:
        model.generationConfig.modalities ?? defaultModalities(model.id),
      baseUrl: model.baseUrl,
      envKey: model.envKey,
    }));
  }

  /**
   * 根据 authType 和 modelId 获取模型配置
   * @param authType - 认证类型
   * @param modelId - 模型 ID
   * @returns 解析后的模型配置，如果不存在则返回 undefined
   */
  getModel(
    authType: AuthType,
    modelId: string,
  ): ResolvedModelConfig | undefined {
    const models = this.modelsByAuthType.get(authType);
    return models?.get(modelId);
  }

  /**
   * 检查指定 authType 和 modelId 的模型是否存在
   * @param authType - 认证类型
   * @param modelId - 模型 ID
   * @returns 是否存在
   */
  hasModel(authType: AuthType, modelId: string): boolean {
    const models = this.modelsByAuthType.get(authType);
    return models?.has(modelId) ?? false;
  }

  /**
   * 获取指定 authType 的默认模型
   * 对于 qwen-oauth，返回 coder 模型
   * 对于其他类型，返回第一个配置的模型
   * @param authType - 认证类型
   * @returns 默认模型配置，如果不存在则返回 undefined
   */
  getDefaultModelForAuthType(
    authType: AuthType,
  ): ResolvedModelConfig | undefined {
    if (authType === AuthType.QWEN_OAUTH) {
      return this.getModel(authType, DEFAULT_QWEN_MODEL);
    }
    const models = this.modelsByAuthType.get(authType);
    if (!models || models.size === 0) return undefined;
    return Array.from(models.values())[0];
  }

  /**
   * 通过应用默认值来解析模型配置
   * @param config - 模型配置
   * @param authType - 认证类型
   * @returns 解析后的模型配置
   */
  private resolveModelConfig(
    config: ModelConfig,
    authType: AuthType,
  ): ResolvedModelConfig {
    this.validateModelConfig(config, authType);

    return {
      ...config,
      authType,
      name: config.name || config.id,
      baseUrl: config.baseUrl || this.getDefaultBaseUrl(authType),
      generationConfig: config.generationConfig ?? {},
      capabilities: config.capabilities || {},
    };
  }

  /**
   * 验证模型配置
   * @param config - 模型配置
   * @param authType - 认证类型
   * @throws 如果缺少必需字段则抛出错误
   */
  private validateModelConfig(config: ModelConfig, authType: AuthType): void {
    if (!config.id) {
      throw new Error(
        `Model config in authType '${authType}' missing required field: id`,
      );
    }
  }

  /**
   * 从更新后的配置重新加载模型
   * 清除现有用户配置的模型并从新配置重新注册
   * 保留硬编码的 qwen-oauth 模型
   * @param modelProvidersConfig - 新的模型提供者配置
   */
  reloadModels(modelProvidersConfig?: ModelProvidersConfig): void {
    // Clear existing user-configured models (preserve qwen-oauth)
    for (const authType of this.modelsByAuthType.keys()) {
      if (authType !== AuthType.QWEN_OAUTH) {
        this.modelsByAuthType.delete(authType);
      }
    }

    // Re-register user-configured models for other authTypes
    if (modelProvidersConfig) {
      for (const [rawKey, models] of Object.entries(modelProvidersConfig)) {
        const authType = validateAuthTypeKey(rawKey);

        if (!authType) {
          debugLogger.warn(
            `Invalid authType key "${rawKey}" in modelProviders config. Expected one of: ${Object.values(AuthType).join(', ')}. Skipping.`,
          );
          continue;
        }

        // Skip qwen-oauth as it uses hard-coded models
        if (authType === AuthType.QWEN_OAUTH) {
          continue;
        }

        this.registerAuthTypeModels(authType, models);
      }
    }
  }
}
