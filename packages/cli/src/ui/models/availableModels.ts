/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AuthType,
  type Config,
  type AvailableModel as CoreAvailableModel,
  QWEN_OAUTH_MODELS,
} from '@qwen-code/qwen-code-core';
import { t } from '../../i18n/index.js';

/**
 * 可用模型类型
 */
export type AvailableModel = {
  id: string;
  label: string;
  description?: string;
  isVision?: boolean;
};

/**
 * 获取可用的 Qwen 模型
 * coder-model 现在默认具有视觉能力
 */
export function getFilteredQwenModels(): AvailableModel[] {
  return [...getQwenOAuthModels()];
}

/**
 * 目前我们使用环境变量中的单个 `OPENAI_MODEL` 模型
 * 将来，更新 settings.json 后，我们将允许用户自行配置
 * @returns 可用模型，如果环境变量未设置则返回 null
 */
export function getOpenAIAvailableModelFromEnv(): AvailableModel | null {
  const id = process.env['OPENAI_MODEL']?.trim();
  return id
    ? {
        id,
        label: id,
        get description() {
          return t('Configured via OPENAI_MODEL environment variable');
        },
      }
    : null;
}

export function getAnthropicAvailableModelFromEnv(): AvailableModel | null {
  const id = process.env['ANTHROPIC_MODEL']?.trim();
  return id
    ? {
        id,
        label: id,
        get description() {
          return t('Configured via ANTHROPIC_MODEL environment variable');
        },
      }
    : null;
}

/**
 * 将核心 AvailableModel 转换为 CLI AvailableModel 格式
 * @param coreModel - 核心模型对象
 * @returns CLI 格式的可用模型
 */
function convertCoreModelToCliModel(
  coreModel: CoreAvailableModel,
): AvailableModel {
  return {
    id: coreModel.id,
    label: coreModel.label,
    description: coreModel.description,
    isVision: coreModel.isVision ?? coreModel.capabilities?.vision ?? false,
  };
}

/**
 * 获取给定 authType 的可用模型
 * 如果提供了 Config 对象，使用 config.getAvailableModelsForAuthType()
 * 仅在未提供配置时回退到环境变量
 * @param authType - 认证类型
 * @param config - 可选的 Config 对象
 * @returns 可用模型数组
 */
export function getAvailableModelsForAuthType(
  authType: AuthType,
  config?: Config,
): AvailableModel[] {
  // Use config's model registry when available
  if (config) {
    try {
      const models = config.getAvailableModelsForAuthType(authType);
      if (models.length > 0) {
        return models.map(convertCoreModelToCliModel);
      }
    } catch {
      // If config throws (e.g., not initialized), return empty array
    }
    // When a Config object is provided, we intentionally do NOT fall back to env-based
    // "raw" models. These may reflect the currently effective config but should not be
    // presented as selectable options in /model.
    return [];
  }

  // Fall back to environment variables for specific auth types (no config provided)
  switch (authType) {
    case AuthType.QWEN_OAUTH: {
      return [...getQwenOAuthModels()];
    }
    case AuthType.USE_OPENAI: {
      const openAIModel = getOpenAIAvailableModelFromEnv();
      return openAIModel ? [openAIModel] : [];
    }
    case AuthType.USE_ANTHROPIC: {
      const anthropicModel = getAnthropicAvailableModelFromEnv();
      return anthropicModel ? [anthropicModel] : [];
    }
    default:
      return [];
  }
}
