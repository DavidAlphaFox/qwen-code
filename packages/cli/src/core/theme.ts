/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { themeManager } from '../ui/themes/theme-manager.js';
import { type LoadedSettings } from '../config/settings.js';
import { t } from '../i18n/index.js';

/**
 * 验证配置的主题
 * @param settings - 已加载的应用程序设置
 * @returns 如果主题未找到返回错误消息，否则返回 null
 */
export function validateTheme(settings: LoadedSettings): string | null {
  const effectiveTheme = settings.merged.ui?.theme;
  if (effectiveTheme && !themeManager.findThemeByName(effectiveTheme)) {
    return t('Theme "{{themeName}}" not found.', {
      themeName: effectiveTheme,
    });
  }
  return null;
}
