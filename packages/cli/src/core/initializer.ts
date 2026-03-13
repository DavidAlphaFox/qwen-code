/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  IdeClient,
  IdeConnectionEvent,
  IdeConnectionType,
  logIdeConnection,
  type Config,
} from '@qwen-code/qwen-code-core';
import { type LoadedSettings, SettingScope } from '../config/settings.js';
import { performInitialAuth } from './auth.js';
import { validateTheme } from './theme.js';
import { initializeI18n, type SupportedLanguage } from '../i18n/index.js';

/**
 * 应用程序初始化结果接口
 */
export interface InitializationResult {
  authError: string | null;
  themeError: string | null;
  shouldOpenAuthDialog: boolean;
  geminiMdFileCount: number;
}

/**
 * 协调应用程序的启动初始化
 * 此函数在 React UI 渲染之前运行
 * @param config - 应用程序配置
 * @param settings - 已加载的应用程序设置
 * @returns 初始化结果
 */
export async function initializeApp(
  config: Config,
  settings: LoadedSettings,
): Promise<InitializationResult> {
  // Initialize i18n system
  const languageSetting =
    process.env['QWEN_CODE_LANG'] ||
    (settings.merged.general?.language as string) ||
    'auto';
  await initializeI18n(languageSetting as SupportedLanguage | 'auto');

  // Use authType from modelsConfig which respects CLI --auth-type argument
  // over settings.security.auth.selectedType
  const authType = config.getModelsConfig().getCurrentAuthType();
  const authError = await performInitialAuth(config, authType);

  // Fallback to user select when initial authentication fails
  if (authError) {
    settings.setValue(
      SettingScope.User,
      'security.auth.selectedType',
      undefined,
    );
  }
  const themeError = validateTheme(settings);

  const shouldOpenAuthDialog =
    !config.getModelsConfig().wasAuthTypeExplicitlyProvided() || !!authError;

  if (config.getIdeMode()) {
    const ideClient = await IdeClient.getInstance();
    await ideClient.connect();
    logIdeConnection(config, new IdeConnectionEvent(IdeConnectionType.START));
  }

  return {
    authError,
    themeError,
    shouldOpenAuthDialog,
    geminiMdFileCount: config.getGeminiMdFileCount(),
  };
}
