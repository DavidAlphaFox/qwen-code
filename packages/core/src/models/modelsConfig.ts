/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';

import { AuthType } from '../core/contentGenerator.js';
import type { ContentGeneratorConfig } from '../core/contentGenerator.js';
import type { ContentGeneratorConfigSources } from '../core/contentGenerator.js';
import { DEFAULT_QWEN_MODEL } from '../config/models.js';
import { tokenLimit } from '../core/tokenLimits.js';
import { defaultModalities } from '../core/modalityDefaults.js';

import { ModelRegistry } from './modelRegistry.js';
import {
  type ModelProvidersConfig,
  type ResolvedModelConfig,
  type AvailableModel,
  type ModelSwitchMetadata,
  type RuntimeModelSnapshot,
} from './types.js';
import {
  MODEL_GENERATION_CONFIG_FIELDS,
  CREDENTIAL_FIELDS,
  PROVIDER_SOURCED_FIELDS,
} from './constants.js';

export {
  MODEL_GENERATION_CONFIG_FIELDS,
  CREDENTIAL_FIELDS,
  PROVIDER_SOURCED_FIELDS,
};

/**
 * 模型变更时的回调函数
 * 用于在 Config 需要刷新 auth/ContentGenerator 时通知
 * @param authType - 认证类型
 * @param requiresRefresh - 是否需要刷新
 * @returns Promise<void>
 */
export type OnModelChangeCallback = (
  authType: AuthType,
  requiresRefresh: boolean,
) => Promise<void>;

/**
 * 创建 ModelsConfig 的选项
 */
export interface ModelsConfigOptions {
  /** 来自设置文件的初始 authType */
  initialAuthType?: AuthType;
  /** 模型提供者配置 */
  modelProvidersConfig?: ModelProvidersConfig;
  /** 来自 CLI/设置文件的生成配置 */
  generationConfig?: Partial<ContentGeneratorConfig>;
  /** 生成配置的源跟踪 */
  generationConfigSources?: ContentGeneratorConfigSources;
  /** 模型变更时的回调函数 */
  onModelChange?: OnModelChangeCallback;
}

/**
 * ModelsConfig 管理所有模型选择逻辑和状态
 *
 * 此类封装了：
 * - ModelRegistry 用于模型配置存储
 * - 当前 authType 和 modelId 的选择
 * - 生成配置管理
 * - 模型切换逻辑
 *
 * Config 使用它作为所有模型相关操作的入口点
 */
export class ModelsConfig {
  private readonly modelRegistry: ModelRegistry;

  // Current selection state
  private currentAuthType: AuthType | undefined;

  // Generation config state
  private _generationConfig: Partial<ContentGeneratorConfig>;
  private generationConfigSources: ContentGeneratorConfigSources;

  // Flag for strict model provider selection
  private strictModelProviderSelection: boolean = false;

  // One-shot flag for qwen-oauth credential caching
  private requireCachedQwenCredentialsOnce: boolean = false;

  // One-shot flag indicating credentials were manually set via updateCredentials()
  // When true, syncAfterAuthRefresh should NOT override these credentials with
  // modelProviders defaults (even if the model ID matches a registry entry).
  //
  // This must be persistent across auth refreshes, because refreshAuth() can be
  // triggered multiple times after a credential prompt flow. We only clear this
  // flag when we explicitly apply modelProvider defaults (i.e. when the user
  // switches to a registry model via switchModel).
  private hasManualCredentials: boolean = false;

  // Callback for notifying Config of model changes
  private onModelChange?: OnModelChangeCallback;

  // Flag indicating whether authType was explicitly provided (not defaulted)
  private readonly authTypeWasExplicitlyProvided: boolean;

  /**
   * 运行时模型快照存储
   *
   * 这些快照存储运行时解析的模型配置，不来自 modelProviders 注册表
   *（例如，使用手动设置的凭据的模型）
   *
   * 键：snapshotId（格式：`$runtime|${authType}|${modelId}`）
   *   使用 `$runtime|` 前缀，因为 `$` 和 `|` 不太可能出现在真实模型 ID 中
   *   这可以防止与包含 `-` 或 `:` 字符的模型 ID 发生冲突
   * 值：包含模型配置的 RuntimeModelSnapshot
   *
   * 注意：这与模型切换期间用于回滚的状态快照不同
   * RuntimeModelSnapshot 存储持久化的模型配置，而状态快照是临时的，仅用于错误恢复
   */
  private runtimeModelSnapshots: Map<string, RuntimeModelSnapshot> = new Map();

  /**
   * 当前活动的 RuntimeModelSnapshot ID
   *
   * 当设置时，表示当前模型是运行时模型（不是来自注册表）
   * 此 ID 包含在状态快照中用于回滚
   */
  private activeRuntimeModelSnapshotId: string | undefined;

  private static deepClone<T>(value: T): T {
    if (value === null || typeof value !== 'object') {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((v) => ModelsConfig.deepClone(v)) as T;
    }
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      out[key] = ModelsConfig.deepClone(
        (value as Record<string, unknown>)[key],
      );
    }
    return out as T;
  }

  constructor(options: ModelsConfigOptions = {}) {
    this.modelRegistry = new ModelRegistry(options.modelProvidersConfig);
    this.onModelChange = options.onModelChange;

    // Initialize generation config
    // Note: generationConfig.model should already be fully resolved by ModelConfigResolver
    // before ModelsConfig is instantiated, so we use it as the single source of truth
    this._generationConfig = {
      ...(options.generationConfig || {}),
    };
    this.generationConfigSources = options.generationConfigSources || {};

    // Track if authType was explicitly provided
    this.authTypeWasExplicitlyProvided = options.initialAuthType !== undefined;

    // Initialize selection state
    this.currentAuthType = options.initialAuthType;
  }

  /**
   * 创建当前 ModelsConfig 状态的快照，用于回滚
   * 在模型切换操作之前使用，以启用错误时的恢复
   *
   * 注意：这与 RuntimeSnapshot 不同，后者存储运行时模型配置
   * @returns 包含当前状态的快照对象
   */
  private createStateSnapshotForRollback(): {
    currentAuthType: AuthType | undefined;
    generationConfig: Partial<ContentGeneratorConfig>;
    generationConfigSources: ContentGeneratorConfigSources;
    strictModelProviderSelection: boolean;
    requireCachedQwenCredentialsOnce: boolean;
    hasManualCredentials: boolean;
    activeRuntimeModelSnapshotId: string | undefined;
  } {
    return {
      currentAuthType: this.currentAuthType,
      generationConfig: ModelsConfig.deepClone(this._generationConfig),
      generationConfigSources: ModelsConfig.deepClone(
        this.generationConfigSources,
      ),
      strictModelProviderSelection: this.strictModelProviderSelection,
      requireCachedQwenCredentialsOnce: this.requireCachedQwenCredentialsOnce,
      hasManualCredentials: this.hasManualCredentials,
      activeRuntimeModelSnapshotId: this.activeRuntimeModelSnapshotId,
    };
  }

  /**
   * 从之前创建的状态快照恢复 ModelsConfig 状态
   * 用于模型切换操作失败时的回滚
   * @param snapshot - 要恢复的状态快照
   */
  private rollbackToStateSnapshot(
    snapshot: ReturnType<ModelsConfig['createStateSnapshotForRollback']>,
  ): void {
    this.currentAuthType = snapshot.currentAuthType;
    this._generationConfig = snapshot.generationConfig;
    this.generationConfigSources = snapshot.generationConfigSources;
    this.strictModelProviderSelection = snapshot.strictModelProviderSelection;
    this.requireCachedQwenCredentialsOnce =
      snapshot.requireCachedQwenCredentialsOnce;
    this.hasManualCredentials = snapshot.hasManualCredentials;
    this.activeRuntimeModelSnapshotId = snapshot.activeRuntimeModelSnapshotId;
  }

  /**
   * 获取当前模型 ID
   * @returns 当前模型 ID
   */
  getModel(): string {
    return this._generationConfig.model || DEFAULT_QWEN_MODEL;
  }

  /**
   * 获取当前 authType
   * @returns 当前 authType
   */
  getCurrentAuthType(): AuthType | undefined {
    return this.currentAuthType;
  }

  /**
   * 检查 authType 是否被显式提供（通过 CLI 或设置文件）
   * 如果为 false，表示尚未提供 authType（新用户）
   * @returns 是否显式提供了 authType
   */
  wasAuthTypeExplicitlyProvided(): boolean {
    return this.authTypeWasExplicitlyProvided;
  }

  /**
   * 获取当前 authType 的可用模型
   * @returns 可用模型数组
   */
  getAvailableModels(): AvailableModel[] {
    return this.currentAuthType
      ? this.modelRegistry.getModelsForAuthType(this.currentAuthType)
      : [];
  }

  /**
   * 获取指定 authType 的可用模型
   * @param authType - 认证类型
   * @returns 可用模型数组
   */
  getAvailableModelsForAuthType(authType: AuthType): AvailableModel[] {
    return this.modelRegistry.getModelsForAuthType(authType);
  }

  /**
   * 获取所有配置的模型（跨 authType）
   *
   * 注意：
   * - 默认返回所有 authType 的模型
   * - qwen-oauth 模型始终排在最前面
   * - 如果有活动状态，运行时模型选项会包含在相同 authType 的注册表模型之前
   * @param authTypes - 可选的 authType 过滤数组
   * @returns 可用模型数组
   */
  getAllConfiguredModels(authTypes?: AuthType[]): AvailableModel[] {
    const inputAuthTypes =
      authTypes && authTypes.length > 0 ? authTypes : Object.values(AuthType);

    // De-duplicate while preserving the original order.
    const seen = new Set<AuthType>();
    const uniqueAuthTypes: AuthType[] = [];
    for (const authType of inputAuthTypes) {
      if (!seen.has(authType)) {
        seen.add(authType);
        uniqueAuthTypes.push(authType);
      }
    }

    // Force qwen-oauth to the front (if requested / defaulted in).
    const orderedAuthTypes: AuthType[] = [];
    if (uniqueAuthTypes.includes(AuthType.QWEN_OAUTH)) {
      orderedAuthTypes.push(AuthType.QWEN_OAUTH);
    }
    for (const authType of uniqueAuthTypes) {
      if (authType !== AuthType.QWEN_OAUTH) {
        orderedAuthTypes.push(authType);
      }
    }

    // Get runtime model option
    const runtimeOption = this.getRuntimeModelOption();

    const allModels: AvailableModel[] = [];
    for (const authType of orderedAuthTypes) {
      // Add runtime option first if it matches this authType
      if (runtimeOption && runtimeOption.authType === authType) {
        allModels.push(runtimeOption);
      }
      // Add registry models
      allModels.push(...this.modelRegistry.getModelsForAuthType(authType));
    }
    return allModels;
  }

  /**
   * 检查指定 authType 和 modelId 的模型是否存在
   * @param authType - 认证类型
   * @param modelId - 模型 ID
   * @returns 是否存在
   */
  hasModel(authType: AuthType, modelId: string): boolean {
    return this.modelRegistry.hasModel(authType, modelId);
  }

  /**
   * 以编程方式设置模型（例如 VLM 自动切换、回退）
   * 支持注册表模型和原始模型 ID
   * @param newModel - 新模型 ID
   * @param metadata - 可选的切换元数据
   * @returns Promise<void>
   */
  async setModel(
    newModel: string,
    metadata?: ModelSwitchMetadata,
  ): Promise<void> {
    // Special case: qwen-oauth model switch - hot update in place
    // coder-model supports vision capabilities and can be hot-updated
    if (
      this.currentAuthType === AuthType.QWEN_OAUTH &&
      newModel === DEFAULT_QWEN_MODEL
    ) {
      this.strictModelProviderSelection = false;
      this._generationConfig.model = newModel;
      this.generationConfigSources['model'] = {
        kind: 'programmatic',
        detail: metadata?.reason || 'setModel',
      };

      // Notify Config to update contentGeneratorConfig
      if (this.onModelChange) {
        await this.onModelChange(AuthType.QWEN_OAUTH, false);
      }
      return;
    }

    // If model exists in registry, use full switch logic
    if (
      this.currentAuthType &&
      this.modelRegistry.hasModel(this.currentAuthType, newModel)
    ) {
      await this.switchModel(this.currentAuthType, newModel);
      return;
    }

    // Raw model override: update generation config in-place
    this.strictModelProviderSelection = false;
    this._generationConfig.model = newModel;
    this.generationConfigSources['model'] = {
      kind: 'programmatic',
      detail: metadata?.reason || 'setModel',
    };
  }

  /**
   * 切换模型（也可选择切换 authType）
   * 支持注册表支持的模型和 RuntimeModelSnapshots
   *
   * 对于运行时模型，modelId 可以是：
   * - RuntimeModelSnapshot ID（格式：`$runtime|${authType}|${modelId}`）
   * - 带显式 `$runtime|` 前缀（格式：`$runtime|${authType}|${modelId}`）
   *
   * 当从 ACP 集成调用时，modelId 已经被 parseAcpModelOption 解析，
   * 剥离了任何 (${authType}) 后缀
   * @param authType - 认证类型
   * @param modelId - 模型 ID
   * @param options - 可选选项
   * @returns Promise<void>
   */
  async switchModel(
    authType: AuthType,
    modelId: string,
    options?: { requireCachedCredentials?: boolean },
  ): Promise<void> {
    // Check if this is a RuntimeModelSnapshot reference
    const runtimeModelSnapshotId = this.extractRuntimeModelSnapshotId(modelId);
    if (runtimeModelSnapshotId) {
      await this.switchToRuntimeModel(runtimeModelSnapshotId);
      return;
    }

    const rollbackSnapshot = this.createStateSnapshotForRollback();
    if (authType === AuthType.QWEN_OAUTH && options?.requireCachedCredentials) {
      this.requireCachedQwenCredentialsOnce = true;
    }

    try {
      const isAuthTypeChange = authType !== this.currentAuthType;
      this.currentAuthType = authType;

      const model = this.modelRegistry.getModel(authType, modelId);
      if (!model) {
        throw new Error(
          `Model '${modelId}' not found for authType '${authType}'`,
        );
      }

      // Apply model defaults
      this.applyResolvedModelDefaults(model);

      // Clear active runtime model snapshot since we're now using a registry model
      this.activeRuntimeModelSnapshotId = undefined;

      const requiresRefresh = isAuthTypeChange
        ? true
        : this.checkRequiresRefresh(
            rollbackSnapshot.generationConfig.model || '',
          );

      if (this.onModelChange) {
        await this.onModelChange(authType, requiresRefresh);
      }
    } catch (error) {
      // Rollback on error
      this.rollbackToStateSnapshot(rollbackSnapshot);
      throw error;
    }
  }

  /**
   * 用于识别 RuntimeModelSnapshot ID 的前缀
   * 选择它是为了避免与可能包含 `-` 或 `:` 的真实模型 ID 冲突
   */
  private static readonly RUNTIME_SNAPSHOT_PREFIX = '$runtime|';

  /**
   * 从 authType 和 modelId 构建 RuntimeModelSnapshot ID
   * 格式为：`$runtime|${authType}|${modelId}`
   *
   * 这是构造快照 ID 的规范方式，确保创建和查找的一致性
   * @param authType - 认证类型
   * @param modelId - 模型 ID
   * @returns 格式为 `$runtime|${authType}|${modelId}` 的快照 ID
   */
  private buildRuntimeModelSnapshotId(
    authType: AuthType,
    modelId: string,
  ): string {
    return `${ModelsConfig.RUNTIME_SNAPSHOT_PREFIX}${authType}|${modelId}`;
  }

  /**
   * 从 modelId 中提取 RuntimeModelSnapshot ID（如果是运行时模型引用）
   *
   * 支持以下格式：
   * - 直接快照 ID：`$runtime|${authType}|${modelId}` → 如果存在于 Map 中则返回原值
   * - 直接快照 ID 匹配：如果存在于 Map 中则返回
   *
   * 注意：当从 setModel 通过 ACP 集成调用时，modelId 已经
   * 被 parseAcpModelOption 解析，剥离了任何 (${authType}) 后缀
   * 所以我们不需要在这里处理 ACP 格式 - ACP 层处理那个
   * @param modelId - 要解析的模型 ID
   * @returns RuntimeModelSnapshot ID（如果找到），否则返回 undefined
   */
  private extractRuntimeModelSnapshotId(modelId: string): string | undefined {
    // Check if modelId starts with the runtime snapshot prefix
    if (modelId.startsWith(ModelsConfig.RUNTIME_SNAPSHOT_PREFIX)) {
      // Verify the snapshot exists
      if (this.runtimeModelSnapshots.has(modelId)) {
        return modelId;
      }
      // Even with prefix, if it doesn't exist, don't return it
      return undefined;
    }

    // Check if modelId itself is a valid snapshot ID (exists in Map)
    if (this.runtimeModelSnapshots.has(modelId)) {
      return modelId;
    }

    return undefined;
  }

  /**
   * 获取用于创建 ContentGenerator 的生成配置
   * @returns 生成配置
   */
  getGenerationConfig(): Partial<ContentGeneratorConfig> {
    return this._generationConfig;
  }

  /**
   * 获取生成配置的源，用于调试/UI
   * @returns 生成配置源
   */
  getGenerationConfigSources(): ContentGeneratorConfigSources {
    return this.generationConfigSources;
  }

  /**
   * 合并设置文件的生成配置，保留现有值
   * 用于清除提供者配置的源后，但仍应应用设置
   * @param settingsGenerationConfig - 来自设置文件的生成配置
   */
  mergeSettingsGenerationConfig(
    settingsGenerationConfig?: Partial<ContentGeneratorConfig>,
  ): void {
    if (!settingsGenerationConfig) {
      return;
    }

    for (const field of MODEL_GENERATION_CONFIG_FIELDS) {
      if (
        !(field in this._generationConfig) &&
        field in settingsGenerationConfig
      ) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this._generationConfig as any)[field] =
          settingsGenerationConfig[field];
        this.generationConfigSources[field] = {
          kind: 'settings',
          detail: `model.generationConfig.${field}`,
        };
      }
    }
  }

  /**
   * 更新生成配置中的凭据
   * 设置一个标志以防止 syncAfterAuthRefresh 覆盖这些凭据
   *
   * 当凭据被手动设置时，我们清除所有提供者配置的源
   * 以保持提供者的原子性（完全应用或不应用）
   * 其他层（CLI、env、设置、默认值）将参与解析
   *
   * 当凭据形成不在注册表中的模型的完整配置时，
   * 还会更新或创建 RuntimeModelSnapshot。这允许运行时模型稍后重用
   * @param credentials - 要更新的凭据
   * @param settingsGenerationConfig - 可选的来自 settings.json 的生成配置
   */
  updateCredentials(
    credentials: {
      apiKey?: string;
      baseUrl?: string;
      model?: string;
    },
    settingsGenerationConfig?: Partial<ContentGeneratorConfig>,
  ): void {
    /**
     * If any fields are updated here, we treat the resulting config as manually overridden
     * and avoid applying modelProvider defaults during the next auth refresh.
     *
     * Clear all provider-sourced configuration to maintain provider atomicity.
     * This ensures that when user manually sets credentials, the provider config
     * is either fully applied (via switchModel) or not at all.
     */
    if (credentials.apiKey || credentials.baseUrl || credentials.model) {
      this.hasManualCredentials = true;
      this.clearProviderSourcedConfig();
    }

    if (credentials.apiKey) {
      this._generationConfig.apiKey = credentials.apiKey;
      this.generationConfigSources['apiKey'] = {
        kind: 'programmatic',
        detail: 'updateCredentials',
      };
    }
    if (credentials.baseUrl) {
      this._generationConfig.baseUrl = credentials.baseUrl;
      this.generationConfigSources['baseUrl'] = {
        kind: 'programmatic',
        detail: 'updateCredentials',
      };
    }
    if (credentials.model) {
      this._generationConfig.model = credentials.model;
      this.generationConfigSources['model'] = {
        kind: 'programmatic',
        detail: 'updateCredentials',
      };
    }
    // When credentials are manually set, disable strict model provider selection
    // so validation doesn't require envKey-based credentials
    this.strictModelProviderSelection = false;
    // Clear apiKeyEnvKey to prevent validation from requiring environment variable
    this._generationConfig.apiKeyEnvKey = undefined;

    // After clearing provider-sourced config, merge settings.model.generationConfig
    // to ensure fields like samplingParams, timeout, etc. are preserved.
    // This follows the resolution strategy where settings.model.generationConfig
    // has lower priority than programmatic overrides but should still be applied.
    if (settingsGenerationConfig) {
      this.mergeSettingsGenerationConfig(settingsGenerationConfig);
    }

    // Sync with runtime model snapshot if we have a complete configuration
    this.syncRuntimeModelSnapshotWithCredentials();
  }

  /**
   * 使用当前凭据同步 RuntimeModelSnapshot
   *
   * 当当前凭据形成不在注册表中的模型的完整配置时，
   * 创建或更新 RuntimeModelSnapshot。这使得可以：
   * - 稍后重用运行时模型配置
   * - 在模型列表中将运行时模型显示为可用选项
   *
   * 仅为不在注册表中的模型创建快照（以避免重复）
   */
  private syncRuntimeModelSnapshotWithCredentials(): void {
    const currentAuthType = this.currentAuthType;
    const { model, apiKey, baseUrl } = this._generationConfig;

    // Early return if missing required fields
    if (!model || !currentAuthType || !apiKey || !baseUrl) {
      return;
    }

    // Check if model exists in registry - if so, don't create RuntimeModelSnapshot
    if (this.modelRegistry.hasModel(currentAuthType, model)) {
      return;
    }

    // If we have an active snapshot, update it
    if (
      this.activeRuntimeModelSnapshotId &&
      this.runtimeModelSnapshots.has(this.activeRuntimeModelSnapshotId)
    ) {
      const snapshot = this.runtimeModelSnapshots.get(
        this.activeRuntimeModelSnapshotId,
      )!;

      // Update snapshot with current values (already verified to exist above)
      snapshot.apiKey = apiKey;
      snapshot.baseUrl = baseUrl;
      snapshot.modelId = model;

      // Update ID if model changed
      const newSnapshotId = this.buildRuntimeModelSnapshotId(
        snapshot.authType,
        snapshot.modelId,
      );
      if (newSnapshotId !== snapshot.id) {
        this.runtimeModelSnapshots.delete(snapshot.id);
        snapshot.id = newSnapshotId;
        this.runtimeModelSnapshots.set(newSnapshotId, snapshot);
        this.activeRuntimeModelSnapshotId = newSnapshotId;
      }

      snapshot.createdAt = Date.now();
    } else {
      // Create new snapshot
      this.detectAndCaptureRuntimeModel();
    }
  }

  /**
   * 清除来自 modelProviders 的配置字段
   * 这确保了当用户手动设置凭据时提供者的配置原子性
   * 其他层（CLI、env、设置、默认值）将参与解析
   */
  private clearProviderSourcedConfig(): void {
    for (const field of PROVIDER_SOURCED_FIELDS) {
      const source = this.generationConfigSources[field];
      if (source?.kind === 'modelProviders') {
        // Clear the value - let other layers resolve it
        delete (this._generationConfig as Record<string, unknown>)[field];
        delete this.generationConfigSources[field];
      }
    }
  }

  /**
   * 获取是否启用了严格的模型提供者选择
   * @returns 是否启用了严格模式
   */
  isStrictModelProviderSelection(): boolean {
    return this.strictModelProviderSelection;
  }

  /**
   * 重置严格的模型提供者选择标志
   */
  resetStrictModelProviderSelection(): void {
    this.strictModelProviderSelection = false;
  }

  /**
   * 检查并使用一次性缓存凭据标志
   * @returns 标志的先前值
   */
  consumeRequireCachedCredentialsFlag(): boolean {
    const value = this.requireCachedQwenCredentialsOnce;
    this.requireCachedQwenCredentialsOnce = false;
    return value;
  }

  /**
   * 将解析后的模型配置应用到生成配置
   * @param model - 解析后的模型配置
   */
  private applyResolvedModelDefaults(model: ResolvedModelConfig): void {
    this.strictModelProviderSelection = true;
    // We're explicitly applying modelProvider defaults now, so manual overrides
    // should no longer block syncAfterAuthRefresh from applying provider defaults.
    this.hasManualCredentials = false;

    this._generationConfig.model = model.id;
    this.generationConfigSources['model'] = {
      kind: 'modelProviders',
      authType: model.authType,
      modelId: model.id,
      detail: 'model.id',
    };

    // Clear credentials to avoid reusing previous model's API key

    // For Qwen OAuth, apiKey must always be a placeholder. It will be dynamically
    // replaced when building requests. Do not preserve any previous key or read
    // from envKey.
    //
    // (OpenAI client instantiation requires an apiKey even though it will be
    // replaced later.)
    if (this.currentAuthType === AuthType.QWEN_OAUTH) {
      this._generationConfig.apiKey = 'QWEN_OAUTH_DYNAMIC_TOKEN';
      this.generationConfigSources['apiKey'] = {
        kind: 'computed',
        detail: 'Qwen OAuth placeholder token',
      };
      this._generationConfig.apiKeyEnvKey = undefined;
      delete this.generationConfigSources['apiKeyEnvKey'];
    } else {
      this._generationConfig.apiKey = undefined;
      this._generationConfig.apiKeyEnvKey = undefined;
    }

    // Read API key from environment variable if envKey is specified
    if (model.envKey !== undefined) {
      const apiKey = process.env[model.envKey];
      if (apiKey) {
        this._generationConfig.apiKey = apiKey;
        this.generationConfigSources['apiKey'] = {
          kind: 'env',
          envKey: model.envKey,
          via: {
            kind: 'modelProviders',
            authType: model.authType,
            modelId: model.id,
            detail: 'envKey',
          },
        };
      }
      this._generationConfig.apiKeyEnvKey = model.envKey;
      this.generationConfigSources['apiKeyEnvKey'] = {
        kind: 'modelProviders',
        authType: model.authType,
        modelId: model.id,
        detail: 'envKey',
      };
    }

    // Base URL
    this._generationConfig.baseUrl = model.baseUrl;
    this.generationConfigSources['baseUrl'] = {
      kind: 'modelProviders',
      authType: model.authType,
      modelId: model.id,
      detail: 'baseUrl',
    };

    // Generation config: apply all fields from MODEL_GENERATION_CONFIG_FIELDS
    const gc = model.generationConfig;
    for (const field of MODEL_GENERATION_CONFIG_FIELDS) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this._generationConfig as any)[field] = gc[field];
      this.generationConfigSources[field] = {
        kind: 'modelProviders',
        authType: model.authType,
        modelId: model.id,
        detail: `generationConfig.${field}`,
      };
    }

    // contextWindowSize fallback: auto-detect from model when not set by provider
    if (gc.contextWindowSize === undefined) {
      this._generationConfig.contextWindowSize = tokenLimit(model.id, 'input');
      this.generationConfigSources['contextWindowSize'] = {
        kind: 'computed',
        detail: 'auto-detected from model',
      };
    }

    // modalities fallback: auto-detect from model when not set by provider
    if (gc.modalities === undefined) {
      this._generationConfig.modalities = defaultModalities(model.id);
      this.generationConfigSources['modalities'] = {
        kind: 'computed',
        detail: 'auto-detected from model',
      };
    }
  }

  /**
   * 检查模型切换是否需要 ContentGenerator 刷新
   *
   * 注意：此方法仅由 switchModel() 为同-authType 模型切换调用
   * 跨-authType 切换使用 switchModel(authType, modelId)，始终需要完全刷新
   *
   * 当调用此方法时：
   * - this.currentAuthType 已经是目标 authType
   * - 我们正在检查在同一 authType 内切换两个模型是否需要刷新
   *
   * 示例：
   * - Qwen OAuth：coder-model 切换（同 authType，热更新安全）
   * - OpenAI：model-a -> model-b 使用相同的 envKey（同 authType，热更新安全）
   * - OpenAI：gpt-4 -> deepseek-chat 使用不同的 envKey（同 authType，需要刷新）
   *
   * 跨-authType 场景：
   * - OpenAI -> Qwen OAuth：由 switchModel(authType, modelId) 处理，始终刷新
   * - Qwen OAuth -> OpenAI：由 switchModel(authType, modelId) 处理，始终刷新
   * @param previousModelId - 之前的模型 ID
   * @returns 是否需要刷新
   */
  private checkRequiresRefresh(previousModelId: string): boolean {
    // Defensive: this method is only called after switchModel() sets currentAuthType,
    // but keep type safety for any future callsites.
    const authType = this.currentAuthType;
    if (!authType) {
      return true;
    }

    // For Qwen OAuth, model switches within the same authType can always be hot-updated
    // (coder-model supports vision capabilities and doesn't require ContentGenerator recreation)
    if (authType === AuthType.QWEN_OAUTH) {
      return false;
    }

    // Get previous and current model configs
    const previousModel = this.modelRegistry.getModel(
      authType,
      previousModelId,
    );
    const currentModel = this.modelRegistry.getModel(
      authType,
      this._generationConfig.model || '',
    );

    // If either model is not in registry, require refresh to be safe
    if (!previousModel || !currentModel) {
      return true;
    }

    // Check if critical fields changed that require ContentGenerator recreation
    const criticalFieldsChanged =
      previousModel.envKey !== currentModel.envKey ||
      previousModel.baseUrl !== currentModel.baseUrl;

    if (criticalFieldsChanged) {
      return true;
    }

    // For other auth types with strict model provider selection,
    // if no critical fields changed, we can still hot-update
    // (e.g., switching between two OpenAI models with same envKey and baseUrl)
    return false;
  }

  /**
   * 认证刷新后使用回退策略同步状态：
   * 1. 如果 modelId 可以在 modelRegistry 中找到，使用 modelRegistry 的配置
   * 2. 否则，如果解析后的生成配置中存在来自其他来源的现有凭据
   *    （不是 modelProviders），保留它们，仅更新 authType/modelId
   * 3. 否则，回退到 authType 的默认模型
   * 4. 如果没有可用的默认模型，使生成配置不完整，让
   *    resolveContentGeneratorConfigWithSources 按预期抛出异常
   * @param authType - 认证类型
   * @param modelId - 可选的模型 ID
   */
  syncAfterAuthRefresh(authType: AuthType, modelId?: string): void {
    this.strictModelProviderSelection = false;
    const previousAuthType = this.currentAuthType;
    this.currentAuthType = authType;

    // Step 1: If modelId exists in registry, always use config from modelRegistry
    // Manual credentials won't have a modelId that matches a provider model (handleAuthSelect prevents it),
    // so if modelId exists in registry, we should always use provider config.
    // This handles provider switching even within the same authType.
    if (modelId && this.modelRegistry.hasModel(authType, modelId)) {
      const resolved = this.modelRegistry.getModel(authType, modelId);
      if (resolved) {
        this.applyResolvedModelDefaults(resolved);
        this.strictModelProviderSelection = true;
        // Clear active runtime model snapshot since we're now using a registry model
        this.activeRuntimeModelSnapshotId = undefined;
        return;
      }
    }

    // Step 2: Check if there are existing credentials from other sources (not modelProviders)
    const apiKeySource = this.generationConfigSources['apiKey'];
    const baseUrlSource = this.generationConfigSources['baseUrl'];
    const hasExistingCredentials =
      (this._generationConfig.apiKey &&
        apiKeySource?.kind !== 'modelProviders') ||
      (this._generationConfig.baseUrl &&
        baseUrlSource?.kind !== 'modelProviders');

    // Only preserve credentials if:
    // 1. AuthType hasn't changed (credentials are authType-specific), AND
    // 2. The modelId doesn't exist in the registry (if it did, we would have used provider config in Step 1), AND
    // 3. Either:
    //    a. We have manual credentials (set via updateCredentials), OR
    //    b. We have existing credentials
    // Note: Even if authType hasn't changed, switching to a different provider model (that exists in registry)
    // will use provider config (Step 1), not preserve old credentials. This ensures credentials change when
    // switching providers, independent of authType changes.
    const isAuthTypeChange = previousAuthType !== authType;
    const shouldPreserveCredentials =
      !isAuthTypeChange &&
      (modelId === undefined ||
        !this.modelRegistry.hasModel(authType, modelId)) &&
      (this.hasManualCredentials || hasExistingCredentials);

    if (shouldPreserveCredentials) {
      // Preserve existing credentials, just update authType and modelId if provided
      if (modelId) {
        this._generationConfig.model = modelId;
        if (!this.generationConfigSources['model']) {
          this.generationConfigSources['model'] = {
            kind: 'programmatic',
            detail: 'auth refresh (preserved credentials)',
          };
        }
      }
      return;
    }

    // Step 3: Fall back to default model for the authType
    const defaultModel =
      this.modelRegistry.getDefaultModelForAuthType(authType);
    if (defaultModel) {
      this.applyResolvedModelDefaults(defaultModel);
      // Clear active runtime model snapshot since we're now using a registry model
      this.activeRuntimeModelSnapshotId = undefined;
      return;
    }

    // Step 4: No default available - leave generationConfig incomplete
    // resolveContentGeneratorConfigWithSources will throw exceptions as expected
    if (modelId) {
      this._generationConfig.model = modelId;
      if (!this.generationConfigSources['model']) {
        this.generationConfigSources['model'] = {
          kind: 'programmatic',
          detail: 'auth refresh (no default model)',
        };
      }
    }
  }

  /**
   * 更新模型变更的回调函数
   * @param callback - 回调函数
   */
  setOnModelChange(callback: OnModelChangeCallback): void {
    this.onModelChange = callback;
  }

  /**
   * 在初始化期间检测并捕获 RuntimeModelSnapshot
   *
   * 检查当前配置是否表示运行时模型（不是来自 modelProviders 注册表）
   * 并将其捕获为 RuntimeModelSnapshot
   *
   * 这使得运行时模型可以跨会话持久化并出现在模型列表中
   * @returns 创建的快照 ID，如果当前配置是注册表模型则返回 undefined
   */
  detectAndCaptureRuntimeModel(): string | undefined {
    const {
      model: currentModel,
      apiKey,
      baseUrl,
      apiKeyEnvKey,
      ...generationConfig
    } = this._generationConfig;
    const currentAuthType = this.currentAuthType;

    if (!currentModel || !currentAuthType) {
      return undefined;
    }

    // Check if model exists in registry - if so, it's not a runtime model
    if (this.modelRegistry.hasModel(currentAuthType, currentModel)) {
      // Current is a registry model, clear any previous RuntimeModelSnapshot for this authType
      this.clearRuntimeModelSnapshotForAuthType(currentAuthType);
      return undefined;
    }

    // Check if we have valid credentials (apiKey + baseUrl)
    const hasValidCredentials =
      this._generationConfig.apiKey && this._generationConfig.baseUrl;

    if (!hasValidCredentials) {
      return undefined;
    }

    // Create or update RuntimeModelSnapshot
    const snapshotId = this.buildRuntimeModelSnapshotId(
      currentAuthType,
      currentModel,
    );
    const snapshot: RuntimeModelSnapshot = {
      id: snapshotId,
      authType: currentAuthType,
      modelId: currentModel,
      apiKey,
      baseUrl,
      apiKeyEnvKey,
      generationConfig,
      sources: { ...this.generationConfigSources },
      createdAt: Date.now(),
    };

    this.runtimeModelSnapshots.set(snapshotId, snapshot);
    this.activeRuntimeModelSnapshotId = snapshotId;

    // Enforce per-authType limit
    this.cleanupOldRuntimeModelSnapshots();

    return snapshotId;
  }

  /**
   * 获取当前活动的 RuntimeModelSnapshot
   * @returns 当前活动的 RuntimeModelSnapshot，如果没有则返回 undefined
   */
  getActiveRuntimeModelSnapshot(): RuntimeModelSnapshot | undefined {
    if (!this.activeRuntimeModelSnapshotId) {
      return undefined;
    }
    return this.runtimeModelSnapshots.get(this.activeRuntimeModelSnapshotId);
  }

  /**
   * 获取当前活动的 RuntimeModelSnapshot ID
   * @returns 活动快照 ID，如果没有则返回 undefined
   */
  getActiveRuntimeModelSnapshotId(): string | undefined {
    return this.activeRuntimeModelSnapshotId;
  }

  /**
   * 切换到 RuntimeModelSnapshot
   *
   * 应用之前捕获的 RuntimeModelSnapshot 的配置
   * 使用状态回滚模式：在切换前创建状态快照，并在错误时恢复
   * @param snapshotId - 要切换到的 RuntimeModelSnapshot ID
   * @returns Promise<void>
   */
  async switchToRuntimeModel(snapshotId: string): Promise<void> {
    const runtimeModelSnapshot = this.runtimeModelSnapshots.get(snapshotId);
    if (!runtimeModelSnapshot) {
      throw new Error(`Runtime model snapshot '${snapshotId}' not found`);
    }

    const rollbackSnapshot = this.createStateSnapshotForRollback();

    try {
      const isAuthTypeChange =
        runtimeModelSnapshot.authType !== this.currentAuthType;
      this.currentAuthType = runtimeModelSnapshot.authType;
      this.activeRuntimeModelSnapshotId = snapshotId;

      // Apply runtime configuration
      this.strictModelProviderSelection = false;
      this.hasManualCredentials = true; // Mark as manual to prevent provider override

      this._generationConfig.model = runtimeModelSnapshot.modelId;
      this.generationConfigSources['model'] = {
        kind: 'programmatic',
        detail: 'runtimeModelSwitch',
      };

      if (runtimeModelSnapshot.apiKey) {
        this._generationConfig.apiKey = runtimeModelSnapshot.apiKey;
        this.generationConfigSources['apiKey'] = runtimeModelSnapshot.sources[
          'apiKey'
        ] || {
          kind: 'programmatic',
          detail: 'runtimeModelSwitch',
        };
      }

      if (runtimeModelSnapshot.baseUrl) {
        this._generationConfig.baseUrl = runtimeModelSnapshot.baseUrl;
        this.generationConfigSources['baseUrl'] = runtimeModelSnapshot.sources[
          'baseUrl'
        ] || {
          kind: 'programmatic',
          detail: 'runtimeModelSwitch',
        };
      }

      if (runtimeModelSnapshot.apiKeyEnvKey) {
        this._generationConfig.apiKeyEnvKey = runtimeModelSnapshot.apiKeyEnvKey;
      }

      // Apply generation config
      if (runtimeModelSnapshot.generationConfig) {
        Object.assign(
          this._generationConfig,
          runtimeModelSnapshot.generationConfig,
        );
      }

      const requiresRefresh = isAuthTypeChange;

      if (this.onModelChange) {
        await this.onModelChange(
          runtimeModelSnapshot.authType,
          requiresRefresh,
        );
      }
    } catch (error) {
      this.rollbackToStateSnapshot(rollbackSnapshot);
      throw error;
    }
  }

  /**
   * 将活动的 RuntimeModelSnapshot 作为 AvailableModel 选项获取
   *
   * 将活动的 RuntimeModelSnapshot 转换为 AvailableModel 格式以在模型列表中显示
   * 如果没有活动的运行时模型则返回 undefined
   * @returns 运行时模型作为 AvailableModel 选项，或 undefined
   */
  private getRuntimeModelOption(): AvailableModel | undefined {
    const snapshot = this.getActiveRuntimeModelSnapshot();
    if (!snapshot) {
      return undefined;
    }

    return {
      id: snapshot.modelId,
      label: snapshot.modelId,
      authType: snapshot.authType,
      /**
       * `isVision` is for automatic switching of qwen-oauth vision model.
       * Runtime models are basically specified via CLI arguments, env variables,
       * or settings for other auth types.
       */
      isVision: false,
      contextWindowSize: snapshot.generationConfig?.contextWindowSize,
      isRuntimeModel: true,
      runtimeSnapshotId: snapshot.id,
    };
  }

  /**
   * 清除特定 authType 的所有 RuntimeModelSnapshot
   *
   * 删除与给定 authType 关联的所有 RuntimeModelSnapshot
   * 切换到注册表模型时调用，以避免过时的 RuntimeModelSnapshot
   * @param authType - 要清除快照的 authType
   */
  private clearRuntimeModelSnapshotForAuthType(authType: AuthType): void {
    for (const [id, snapshot] of this.runtimeModelSnapshots.entries()) {
      if (snapshot.authType === authType) {
        this.runtimeModelSnapshots.delete(id);
        if (this.activeRuntimeModelSnapshotId === id) {
          this.activeRuntimeModelSnapshotId = undefined;
        }
      }
    }
  }

  /**
   * 清理旧的 RuntimeModelSnapshot 以强制执行每个 authType 的限制
   *
   * 仅保留每个 authType 的最新 RuntimeModelSnapshot
   * 删除旧快照以防止无限增长
   */
  private cleanupOldRuntimeModelSnapshots(): void {
    const snapshotsByAuthType = new Map<AuthType, RuntimeModelSnapshot>();

    for (const snapshot of this.runtimeModelSnapshots.values()) {
      const existing = snapshotsByAuthType.get(snapshot.authType);
      if (!existing || snapshot.createdAt > existing.createdAt) {
        snapshotsByAuthType.set(snapshot.authType, snapshot);
      }
    }

    this.runtimeModelSnapshots.clear();
    for (const snapshot of snapshotsByAuthType.values()) {
      this.runtimeModelSnapshots.set(snapshot.id, snapshot);
    }

    // Update active snapshot ID if it was removed
    if (
      this.activeRuntimeModelSnapshotId &&
      !this.runtimeModelSnapshots.has(this.activeRuntimeModelSnapshotId)
    ) {
      this.activeRuntimeModelSnapshotId = undefined;
    }
  }

  /**
   * 在运行时重新加载模型提供者配置
   * 这允许在不重新启动 CLI 的情况下热重载 modelProviders 设置
   * @param modelProvidersConfig - 更新后的模型提供者配置
   */
  reloadModelProvidersConfig(
    modelProvidersConfig?: ModelProvidersConfig,
  ): void {
    this.modelRegistry.reloadModels(modelProvidersConfig);
  }
}
