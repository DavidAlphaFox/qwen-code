/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  AuthType,
  ContentGeneratorConfig,
  InputModalities,
} from '../core/contentGenerator.js';
import type { ConfigSources } from '../utils/configResolver.js';

/**
 * 模型能力配置
 */
export interface ModelCapabilities {
  /** 支持图片/视觉输入 */
  vision?: boolean;
}

/**
 * 模型作用域的生成配置
 *
 * 与 {@link ContentGeneratorConfig} 保持一致，以便 modelProviders
 * 可以直接输入内容生成器解析，无需形状转换
 */
export type ModelGenerationConfig = Pick<
  ContentGeneratorConfig,
  | 'samplingParams'
  | 'timeout'
  | 'maxRetries'
  | 'retryErrorCodes'
  | 'enableCacheControl'
  | 'schemaCompliance'
  | 'reasoning'
  | 'customHeaders'
  | 'extra_body'
  | 'contextWindowSize'
  | 'modalities'
>;

/**
 * 单个模型在 authType 中的模型配置
 */
export interface ModelConfig {
  /** 在 authType 中的唯一模型 ID（例如 "qwen-coder"、"gpt-4-turbo"） */
  id: string;
  /** 显示名称（默认为 id） */
  name?: string;
  /** 模型描述 */
  description?: string;
  /** 环境变量名，用于读取 API 密钥（例如 "OPENAI_API_KEY"） */
  envKey?: string;
  /** API 端点覆盖 */
  baseUrl?: string;
  /** 模型能力，保留以供将来使用。现在我们不读取此字段来确定多模态支持或其他能力 */
  capabilities?: ModelCapabilities;
  /** 生成配置（采样参数） */
  generationConfig?: ModelGenerationConfig;
}

/**
 * 按 authType 分组的模型提供者配置
 */
export type ModelProvidersConfig = {
  [authType: string]: ModelConfig[];
};

/**
 * 应用所有默认值后的解析模型配置
 */
export interface ResolvedModelConfig extends ModelConfig {
  /** 模型所属的 AuthType（始终从映射键存在） */
  authType: AuthType;
  /** 显示名称（始终存在，默认为 id） */
  name: string;
  /** 环境变量名，用于读取 API 密钥（可选，特定于提供商） */
  envKey?: string;
  /** API 基础 URL（始终存在，每个 authType 有默认值） */
  baseUrl: string;
  /** 生成配置（始终存在，与默认值合并） */
  generationConfig: ModelGenerationConfig;
  /** 能力（始终存在，默认为 {}） */
  capabilities: ModelCapabilities;
}

/**
 * 用于 UI 显示的模型信息
 */
export interface AvailableModel {
  id: string;
  label: string;
  description?: string;
  capabilities?: ModelCapabilities;
  authType: AuthType;
  isVision?: boolean;
  contextWindowSize?: number;
  modalities?: InputModalities;
  baseUrl?: string;
  envKey?: string;

  /** 是否为运行时模型（不是来自 modelProviders） */
  isRuntimeModel?: boolean;

  /** 运行时模型快照 ID（如果 isRuntimeModel 为 true） */
  runtimeSnapshotId?: string;
}

/**
 * 模型切换操作的元数据
 */
export interface ModelSwitchMetadata {
  /** 切换原因 */
  reason?: string;
  /** 额外上下文 */
  context?: string;
}

/**
 * 运行时模型快照 - 捕获来自非 modelProviders 来源的完整模型配置
 */
export interface RuntimeModelSnapshot {
  /** 快照唯一标识符 */
  id: string;

  /** 关联的 AuthType */
  authType: AuthType;

  /** 模型 ID */
  modelId: string;

  /** API 密钥（可能来自 env/cli/手动输入） */
  apiKey?: string;

  /** 基础 URL（可能来自 env/cli/settings/credentials） */
  baseUrl?: string;

  /** 环境变量名（如果 apiKey 来自 env） */
  apiKeyEnvKey?: string;

  /** 生成配置（采样参数等） */
  generationConfig?: ModelGenerationConfig;

  /** 配置源跟踪 */
  sources: ConfigSources;

  /** 快照创建时间戳 */
  createdAt: number;
}
