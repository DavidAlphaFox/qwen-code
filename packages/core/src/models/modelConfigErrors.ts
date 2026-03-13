/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 获取指定认证类型的默认 API 密钥环境变量名
 * @param authType - 认证类型
 * @returns 环境变量名
 */
export function getDefaultApiKeyEnvVar(authType: string | undefined): string {
  switch (authType) {
    case 'openai':
      return 'OPENAI_API_KEY';
    case 'anthropic':
      return 'ANTHROPIC_API_KEY';
    case 'gemini':
      return 'GEMINI_API_KEY';
    case 'vertex-ai':
      return 'GOOGLE_API_KEY';
    default:
      return 'API_KEY';
  }
}

/**
 * 获取指定认证类型的默认模型环境变量名
 * @param authType - 认证类型
 * @returns 环境变量名
 */
export function getDefaultModelEnvVar(authType: string | undefined): string {
  switch (authType) {
    case 'openai':
      return 'OPENAI_MODEL';
    case 'anthropic':
      return 'ANTHROPIC_MODEL';
    case 'gemini':
      return 'GEMINI_MODEL';
    case 'vertex-ai':
      return 'GOOGLE_MODEL';
    default:
      return 'MODEL';
  }
}

/**
 * 模型配置错误的基类
 */
export abstract class ModelConfigError extends Error {
  abstract readonly code: string;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * 严格模式下缺少凭据的错误
 * 当使用 modelProviders 配置但未设置所需的环境变量时抛出
 */
export class StrictMissingCredentialsError extends ModelConfigError {
  readonly code = 'STRICT_MISSING_CREDENTIALS';

  constructor(
    authType: string | undefined,
    model: string | undefined,
    envKey?: string,
  ) {
    const providerKey = authType || '(unknown)';
    const modelName = model || '(unknown)';
    super(
      `Missing credentials for modelProviders model '${modelName}'. ` +
        (envKey
          ? `Current configured envKey: '${envKey}'. Set that environment variable, or update modelProviders.${providerKey}[].envKey.`
          : `Configure modelProviders.${providerKey}[].envKey and set that environment variable.`),
    );
  }
}

/**
 * 严格模式下缺少模型 ID 的错误
 * 当 modelProviders 解析需要模型 ID 但未提供时抛出
 */
export class StrictMissingModelIdError extends ModelConfigError {
  readonly code = 'STRICT_MISSING_MODEL_ID';

  constructor(authType: string | undefined) {
    super(
      `Missing model id for strict modelProviders resolution (authType: ${authType}).`,
    );
  }
}

/**
 * 缺少 API 密钥的错误
 * 当未提供 API 密钥时抛出
 */
export class MissingApiKeyError extends ModelConfigError {
  readonly code = 'MISSING_API_KEY';

  constructor(params: {
    authType: string | undefined;
    model: string | undefined;
    baseUrl: string | undefined;
    envKey: string;
  }) {
    super(
      `Missing API key for ${params.authType} auth. ` +
        `Current model: '${params.model || '(unknown)'}', baseUrl: '${params.baseUrl || '(default)'}'. ` +
        `Provide an API key via settings (security.auth.apiKey), ` +
        `or set the environment variable '${params.envKey}'.`,
    );
  }
}

/**
 * 缺少模型的错误
 * 当未设置模型环境变量时抛出
 */
export class MissingModelError extends ModelConfigError {
  readonly code = 'MISSING_MODEL';

  constructor(params: { authType: string | undefined; envKey: string }) {
    super(
      `Missing model for ${params.authType} auth. ` +
        `Set the environment variable '${params.envKey}'.`,
    );
  }
}

/**
 * 缺少基础 URL 的错误
 * 当 modelProviders 模型未配置 baseUrl 时抛出
 */
export class MissingBaseUrlError extends ModelConfigError {
  readonly code = 'MISSING_BASE_URL';

  constructor(params: {
    authType: string | undefined;
    model: string | undefined;
  }) {
    super(
      `Missing baseUrl for modelProviders model '${params.model || '(unknown)'}'. ` +
        `Configure modelProviders.${params.authType || '(unknown)'}[].baseUrl.`,
    );
  }
}

/**
 * 缺少 Anthropic 基础 URL 环境变量的错误
 * 当使用 Anthropic 认证但未设置 ANTHROPIC_BASE_URL 时抛出
 */
export class MissingAnthropicBaseUrlEnvError extends ModelConfigError {
  readonly code = 'MISSING_ANTHROPIC_BASE_URL_ENV';

  constructor() {
    super('ANTHROPIC_BASE_URL environment variable not found.');
  }
}
