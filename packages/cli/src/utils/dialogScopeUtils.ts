/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LoadedSettings } from '../config/settings.js';
import { SettingScope } from '../config/settings.js';
import { settingExistsInScope } from './settingsUtils.js';

/**
 * 对话框组件的共享作用域标签，用于显示设置作用域
 */
export const SCOPE_LABELS = {
  [SettingScope.User]: 'User Settings',
  [SettingScope.Workspace]: 'Workspace Settings',

  // TODO: migrate system settings to user settings
  // we don't want to save settings to system scope, it is a troublemaker
  // comment it out for now.
  // [SettingScope.System]: 'System Settings',
} as const;

/**
 * 获取单选按钮选择的作用域项
 * @returns 作用域选项数组
 */
export function getScopeItems() {
  return [
    { label: SCOPE_LABELS[SettingScope.User], value: SettingScope.User },
    {
      label: SCOPE_LABELS[SettingScope.Workspace],
      value: SettingScope.Workspace,
    },
    // { label: SCOPE_LABELS[SettingScope.System], value: SettingScope.System },
  ];
}

/**
 * 为特定设置生成作用域消息
 * @param settingKey - 设置键名
 * @param selectedScope - 选中的作用域
 * @param settings - 已加载的设置
 * @returns string 作用域消息字符串
 */
export function getScopeMessageForSetting(
  settingKey: string,
  selectedScope: SettingScope,
  settings: LoadedSettings,
): string {
  const otherScopes = Object.values(SettingScope).filter(
    (scope) => scope !== selectedScope,
  );

  const modifiedInOtherScopes = otherScopes.filter((scope) => {
    const scopeSettings = settings.forScope(scope).settings;
    return settingExistsInScope(settingKey, scopeSettings);
  });

  if (modifiedInOtherScopes.length === 0) {
    return '';
  }

  const modifiedScopesStr = modifiedInOtherScopes.join(', ');
  const currentScopeSettings = settings.forScope(selectedScope).settings;
  const existsInCurrentScope = settingExistsInScope(
    settingKey,
    currentScopeSettings,
  );

  return existsInCurrentScope
    ? `(Also modified in ${modifiedScopesStr})`
    : `(Modified in ${modifiedScopesStr})`;
}
