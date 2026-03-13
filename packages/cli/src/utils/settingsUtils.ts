/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import type {
  Settings,
  SettingScope,
  LoadedSettings,
} from '../config/settings.js';
import type {
  SettingDefinition,
  SettingsSchema,
  SettingsType,
  SettingsValue,
} from '../config/settingsSchema.js';
import { getSettingsSchema } from '../config/settingsSchema.js';
import { t } from '../i18n/index.js';
import { isAutoLanguage } from './languageUtils.js';

// 模式现在是嵌套的，但 UI 和逻辑的许多部分使用扁平化结构和点号键会更好
// 本节将模式展平为映射以便查找

/** 展平后的模式类型 */
type FlattenedSchema = Record<string, SettingDefinition & { key: string }>;

/**
 * 将嵌套模式展平为单层映射
 * @param schema - 要展平的模式
 * @param prefix - 键前缀
 * @returns FlattenedSchema 展平后的模式对象
 */
function flattenSchema(schema: SettingsSchema, prefix = ''): FlattenedSchema {
  let result: FlattenedSchema = {};
  for (const key in schema) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    const definition = schema[key];
    result[newKey] = { ...definition, key: newKey };
    if (definition.properties) {
      result = { ...result, ...flattenSchema(definition.properties, newKey) };
    }
  }
  return result;
}

let _FLATTENED_SCHEMA: FlattenedSchema | undefined;

/**
 * 返回展平后的模式，首次调用会被缓存以供后续使用
 * @returns FlattenedSchema 展平后的模式对象
 */
export function getFlattenedSchema() {
  return (
    _FLATTENED_SCHEMA ??
    (_FLATTENED_SCHEMA = flattenSchema(getSettingsSchema()))
  );
}

function clearFlattenedSchema() {
  _FLATTENED_SCHEMA = undefined;
}

/**
 * 获取按类别分组的所有设置
 * @returns Record<string, Array<SettingDefinition & { key: string }>> 按类别分组的设置
 */
export function getSettingsByCategory(): Record<
  string,
  Array<SettingDefinition & { key: string }>
> {
  const categories: Record<
    string,
    Array<SettingDefinition & { key: string }>
  > = {};

  Object.values(getFlattenedSchema()).forEach((definition) => {
    const category = definition.category;
    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push(definition);
  });

  return categories;
}

/**
 * 根据键获取设置定义
 * @param key - 设置键名
 * @returns (SettingDefinition & { key: string }) | undefined 设置定义，如果不存在则返回 undefined
 */
export function getSettingDefinition(
  key: string,
): (SettingDefinition & { key: string }) | undefined {
  return getFlattenedSchema()[key];
}

/**
 * 检查设置是否需要重启
 * @param key - 设置键名
 * @returns boolean 是否需要重启
 */
export function requiresRestart(key: string): boolean {
  return getFlattenedSchema()[key]?.requiresRestart ?? false;
}

/**
 * 获取设置的默认值
 * @param key - 设置键名
 * @returns SettingsValue 设置的默认值
 */
export function getDefaultValue(key: string): SettingsValue {
  return getFlattenedSchema()[key]?.default;
}

/**
 * 获取所有需要重启的设置键
 * @returns string[] 需要重启的设置键数组
 */
export function getRestartRequiredSettings(): string[] {
  return Object.values(getFlattenedSchema())
    .filter((definition) => definition.requiresRestart)
    .map((definition) => definition.key);
}

/**
 * 使用键路径数组从嵌套对象递归获取值
 * @param obj - 目标对象
 * @param path - 键路径数组
 * @returns unknown 获取到的值，如果路径无效则返回 undefined
 */
export function getNestedValue(
  obj: Record<string, unknown>,
  path: string[],
): unknown {
  const [first, ...rest] = path;
  if (!first || !(first in obj)) {
    return undefined;
  }
  const value = obj[first];
  if (rest.length === 0) {
    return value;
  }
  if (value && typeof value === 'object' && value !== null) {
    return getNestedValue(value as Record<string, unknown>, rest);
  }
  return undefined;
}

/**
 * 使用点号分隔的路径从嵌套对象获取值
 * @param obj - 目标对象
 * @param path - 点号分隔的路径字符串
 * @returns unknown 获取到的值
 */
export function getNestedProperty(
  obj: Record<string, unknown>,
  path: string,
): unknown {
  return getNestedValue(obj, path.split('.'));
}

/**
 * 获取设置的有效值，考虑从更高作用域继承
 * 始终返回值（从不是 undefined）- 如果在任何地方都未设置则回退到默认值
 * @param key - 设置键名
 * @param settings - 设置对象
 * @param mergedSettings - 合并后的设置对象
 * @returns SettingsValue 设置的有效值
 */
export function getEffectiveValue(
  key: string,
  settings: Settings,
  mergedSettings: Settings,
): SettingsValue {
  const definition = getSettingDefinition(key);
  if (!definition) {
    return undefined;
  }

  const path = key.split('.');

  // 首先检查当前作用域的设置
  let value = getNestedValue(settings as Record<string, unknown>, path);
  if (value !== undefined) {
    return value as SettingsValue;
  }

  // 检查合并设置中的继承值
  value = getNestedValue(mergedSettings as Record<string, unknown>, path);
  if (value !== undefined) {
    return value as SettingsValue;
  }

  // 如果在任何地方都未设置值，则返回默认值
  return definition.default;
}

/**
 * 获取模式中的所有设置键
 * @returns string[] 设置键数组
 */
export function getAllSettingKeys(): string[] {
  return Object.keys(getFlattenedSchema());
}

/**
 * 根据类型获取设置
 * @param type - 设置类型
 * @returns Array<SettingDefinition & { key: string }> 匹配类型的设置数组
 */
export function getSettingsByType(
  type: SettingsType,
): Array<SettingDefinition & { key: string }> {
  return Object.values(getFlattenedSchema()).filter(
    (definition) => definition.type === type,
  );
}

/**
 * 获取需要重启的设置
 * @returns Array<SettingDefinition & { key: string }> 需要重启的设置数组
 */
export function getSettingsRequiringRestart(): Array<
  SettingDefinition & {
    key: string;
  }
> {
  return Object.values(getFlattenedSchema()).filter(
    (definition) => definition.requiresRestart,
  );
}

/**
 * 验证设置键是否在模式中存在
 * @param key - 设置键名
 * @returns boolean 是否有效
 */
export function isValidSettingKey(key: string): boolean {
  return key in getFlattenedSchema();
}

/**
 * 获取设置的类别
 * @param key - 设置键名
 * @returns string | undefined 设置类别
 */
export function getSettingCategory(key: string): string | undefined {
  return getFlattenedSchema()[key]?.category;
}

/**
 * 检查设置是否应显示在设置对话框中
 * @param key - 设置键名
 * @returns boolean 是否应显示
 */
export function shouldShowInDialog(key: string): boolean {
  return getFlattenedSchema()[key]?.showInDialog ?? true; // 为保持向后兼容默认为 true
}

/**
 * 获取应显示在对话框中的所有设置，按类别分组
 * @returns Record<string, Array<SettingDefinition & { key: string }>> 按类别分组的设置
 */
export function getDialogSettingsByCategory(): Record<
  string,
  Array<SettingDefinition & { key: string }>
> {
  const categories: Record<
    string,
    Array<SettingDefinition & { key: string }>
  > = {};

  Object.values(getFlattenedSchema())
    .filter((definition) => definition.showInDialog !== false)
    .forEach((definition) => {
      const category = definition.category;
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(definition);
    });

  return categories;
}

/**
 * 获取应显示在对话框中的指定类型的设置
 * @param type - 设置类型
 * @returns Array<SettingDefinition & { key: string }> 匹配类型的设置数组
 */
export function getDialogSettingsByType(
  type: SettingsType,
): Array<SettingDefinition & { key: string }> {
  return Object.values(getFlattenedSchema()).filter(
    (definition) =>
      definition.type === type && definition.showInDialog !== false,
  );
}

/**
 * 设置对话框中显示的设置的显式显示顺序
 * 设置按重要性和逻辑分组排序：
 * 1. 工作流控制（影响最大）
 * 2. 本地化
 * 3. 编辑器/Shell 体验
 * 4. 显示首选项
 * 5. Git 行为
 * 6. 文件过滤
 * 7. 系统设置（很少更改）
 *
 * 此处未列出的具有 showInDialog: true 的新设置将显示在列表末尾
 */
const SETTINGS_DIALOG_ORDER: readonly string[] = [
  // 工作流控制 - 影响最大的设置
  'tools.approvalMode',

  // 本地化 - 用户经常首先设置
  'general.language',
  'general.outputLanguage',

  // 主题
  'ui.theme',

  // 编辑器/Shell 体验
  'general.vimMode',
  'tools.shell.enableInteractiveShell',

  // 显示首选项
  'general.preferredEditor',
  'ide.enabled',
  'ui.showLineNumbers',
  'ui.hideTips',
  'general.terminalBell',
  'ui.enableWelcomeBack',

  // Git 行为
  'general.gitCoAuthor',

  // 文件过滤
  'context.fileFiltering.respectGitIgnore',
  'context.fileFiltering.respectQwenIgnore',

  // 系统设置 - 很少更改
  'general.disableAutoUpdate',

  // 隐私
  'privacy.usageStatisticsEnabled',
] as const;

/**
 * 获取应显示在对话框中的所有设置键，按显示顺序排序
 * @returns string[] 排序后的设置键数组
 */
export function getDialogSettingKeys(): string[] {
  const dialogSettings = Object.values(getFlattenedSchema())
    .filter((definition) => definition.showInDialog === true)
    .map((definition) => definition.key);

  // 按显式顺序排序；不在顺序数组中的设置出现在末尾
  return dialogSettings.sort((a, b) => {
    const indexA = SETTINGS_DIALOG_ORDER.indexOf(a);
    const indexB = SETTINGS_DIALOG_ORDER.indexOf(b);

    // 如果都在顺序数组中，按位置排序
    if (indexA !== -1 && indexB !== -1) {
      return indexA - indexB;
    }
    // 如果只有一个在数组中，优先数组中的
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    // 如果都不在数组中，保持原始顺序
    return 0;
  });
}

// ============================================================================
// 业务逻辑工具（设置操作的高级工具）
// ============================================================================

/**
 * 获取特定作用域中设置的当前值
 * 始终返回值（从不是 undefined）- 如果在任何地方都未设置则回退到默认值
 * @param key - 设置键名
 * @param settings - 设置对象
 * @param mergedSettings - 合并后的设置对象
 * @returns boolean 设置的布尔值
 */
export function getSettingValue(
  key: string,
  settings: Settings,
  mergedSettings: Settings,
): boolean {
  const definition = getSettingDefinition(key);
  if (!definition) {
    return false; // 无效设置的默认回退
  }

  const value = getEffectiveValue(key, settings, mergedSettings);
  // 确保返回布尔值，从更通用的类型转换
  if (typeof value === 'boolean') {
    return value;
  }
  // 回退到默认值，确保它是布尔值
  const defaultValue = definition.default;
  if (typeof defaultValue === 'boolean') {
    return defaultValue;
  }
  return false; // 最终回退
}

/**
 * 检查设置值是否与其默认值不同
 * @param key - 设置键名
 * @param value - 要检查的值
 * @returns boolean 是否已修改
 */
export function isSettingModified(key: string, value: boolean): boolean {
  const defaultValue = getDefaultValue(key);
  // 正确处理类型比较
  if (typeof defaultValue === 'boolean') {
    return value !== defaultValue;
  }
  // 如果默认值不是布尔值，则当值为 true 时认为已修改
  return value === true;
}

/**
 * 检查设置是否存在于特定作用域的原始设置文件中
 * @param key - 设置键名
 * @param scopeSettings - 作用域设置
 * @returns boolean 是否存在
 */
export function settingExistsInScope(
  key: string,
  scopeSettings: Settings,
): boolean {
  const path = key.split('.');
  const value = getNestedValue(scopeSettings as Record<string, unknown>, path);
  return value !== undefined;
}

/**
 * 强制设置嵌套属性值（即使路径不存在也会创建）
 * @param obj - 目标对象
 * @param path - 点号分隔的路径
 * @param value - 要设置的值
 */
export function setNestedPropertyForce(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const keys = path.split('.');
  const lastKey = keys.pop();
  if (!lastKey) return;

  let current: Record<string, unknown> = obj;
  for (const key of keys) {
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  current[lastKey] = value;
}

/**
 * 安全地设置嵌套属性值（仅在路径存在时才设置）
 * @param obj - 目标对象
 * @param path - 点号分隔的路径
 * @param value - 要设置的值
 */
export function setNestedPropertySafe(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const keys = path.split('.');
  const lastKey = keys.pop();
  if (!lastKey) return;

  let current: Record<string, unknown> = obj;
  for (const key of keys) {
    if (current[key] === undefined) {
      current[key] = {};
    }
    const next = current[key];
    if (typeof next === 'object' && next !== null) {
      current = next as Record<string, unknown>;
    } else {
      return;
    }
  }

  current[lastKey] = value;
}

/**
 * 安全地删除嵌套属性
 * @param obj - 目标对象
 * @param path - 点号分隔的路径
 */
export function deleteNestedPropertySafe(
  obj: Record<string, unknown>,
  path: string,
): void {
  const keys = path.split('.');
  const lastKey = keys.pop();
  if (!lastKey) return;

  let current: Record<string, unknown> = obj;
  for (const key of keys) {
    const next = current[key];
    if (typeof next !== 'object' || next === null) {
      return;
    }
    current = next as Record<string, unknown>;
  }

  delete current[lastKey];
}

/**
 * 在待定设置中设置设置值
 * @param key - 设置键名
 * @param value - 布尔值
 * @param pendingSettings - 待定设置
 * @returns Settings 更新后的设置
 */
export function setPendingSettingValue(
  key: string,
  value: boolean,
  pendingSettings: Settings,
): Settings {
  const newSettings = JSON.parse(JSON.stringify(pendingSettings));
  setNestedPropertyForce(newSettings, key, value);
  return newSettings;
}

/**
 * 通用设置器：在待定设置中设置任意类型的设置值
 * @param key - 设置键名
 * @param value - 设置值
 * @param pendingSettings - 待定设置
 * @returns Settings 更新后的设置
 */
export function setPendingSettingValueAny(
  key: string,
  value: SettingsValue,
  pendingSettings: Settings,
): Settings {
  const newSettings = structuredClone(pendingSettings);
  setNestedPropertyForce(newSettings, key, value);
  return newSettings;
}

/**
 * 检查是否有任何修改的设置需要重启
 * @param modifiedSettings - 修改的设置集合
 * @returns boolean 是否有需要重启的设置
 */
export function hasRestartRequiredSettings(
  modifiedSettings: Set<string>,
): boolean {
  return Array.from(modifiedSettings).some((key) => requiresRestart(key));
}

/**
 * 从修改的设置中获取需要重启的设置
 * @param modifiedSettings - 修改的设置集合
 * @returns string[] 需要重启的设置键数组
 */
export function getRestartRequiredFromModified(
  modifiedSettings: Set<string>,
): string[] {
  return Array.from(modifiedSettings).filter((key) => requiresRestart(key));
}

/**
 * 将修改的设置保存到适当的作用域
 * @param modifiedSettings - 修改的设置集合
 * @param pendingSettings - 待定设置
 * @param loadedSettings - 已加载的设置
 * @param scope - 目标作用域
 */
export function saveModifiedSettings(
  modifiedSettings: Set<string>,
  pendingSettings: Settings,
  loadedSettings: LoadedSettings,
  scope: SettingScope,
): void {
  modifiedSettings.forEach((settingKey) => {
    const path = settingKey.split('.');
    const value = getNestedValue(
      pendingSettings as Record<string, unknown>,
      path,
    );

    const existsInOriginalFile = settingExistsInScope(
      settingKey,
      loadedSettings.forScope(scope).settings,
    );

    if (value === undefined) {
      // 当键存在于作用域文件中时，将 `undefined` 视为"取消设置"
      // LoadedSettings.setValue(..., undefined) 在代码库其他地方用于从磁盘删除可选设置
      if (existsInOriginalFile) {
        loadedSettings.setValue(scope, settingKey, undefined);
      }
      return;
    }

    const isDefaultValue = value === getDefaultValue(settingKey);

    if (existsInOriginalFile || !isDefaultValue) {
      loadedSettings.setValue(scope, settingKey, value);
    }
  });
}

/**
 * 获取设置的显示值，显示当前作用域值和默认值更改指示器
 * @param key - 设置键名
 * @param settings - 设置对象
 * @param _mergedSettings - 合并后的设置对象
 * @param modifiedSettings - 修改的设置集合
 * @param pendingSettings - 可选的待定设置
 * @returns string 显示值字符串
 */
export function getDisplayValue(
  key: string,
  settings: Settings,
  _mergedSettings: Settings,
  modifiedSettings: Set<string>,
  pendingSettings?: Settings,
): string {
  // 如果用户已修改此设置，优先显示待定更改
  const definition = getSettingDefinition(key);

  let value: SettingsValue;
  if (pendingSettings && settingExistsInScope(key, pendingSettings)) {
    // 当待定（未保存）编辑存在时显示其值
    value = getEffectiveValue(key, pendingSettings, {});
  } else if (settingExistsInScope(key, settings)) {
    // 如果当前作用域存在则显示该值
    value = getEffectiveValue(key, settings, {});
  } else {
    // 当键在此作用域未设置时回退到模式默认值
    value = getDefaultValue(key);
  }

  let valueString = String(value);

  // 特殊处理 outputLanguage 'auto' 值
  if (key === 'general.outputLanguage' && isAutoLanguage(value as string)) {
    valueString = t('Auto (detect from system)');
  } else if (definition?.type === 'enum' && definition.options) {
    const option = definition.options?.find((option) => option.value === value);
    if (option?.label) {
      valueString = t(option.label) || option.label;
    } else {
      valueString = `${value}`;
    }
  }

  // 检查值是否与默认值不同，或者是否在修改的设置中，或者是否有待定更改
  const defaultValue = getDefaultValue(key);
  const isChangedFromDefault = value !== defaultValue;
  const isInModifiedSettings = modifiedSettings.has(key);

  // 如果设置存在于当前作用域或修改的设置中，则标记为已修改
  if (settingExistsInScope(key, settings) || isInModifiedSettings) {
    return `${valueString}*`; // * 表示在当前作用域中设置
  }
  if (isChangedFromDefault || isInModifiedSettings) {
    return `${valueString}*`; // * 表示与默认值不同
  }

  return valueString;
}

/**
 * 检查设置是否不存在于当前作用域（应灰显）
 * @param key - 设置键名
 * @param settings - 设置对象
 * @returns boolean 是否为默认值
 */
export function isDefaultValue(key: string, settings: Settings): boolean {
  return !settingExistsInScope(key, settings);
}

/**
 * 检查设置值是否被继承（未在当前作用域设置）
 * @param key - 设置键名
 * @param settings - 设置对象
 * @param _mergedSettings - 合并后的设置对象
 * @returns boolean 是否为继承值
 */
export function isValueInherited(
  key: string,
  settings: Settings,
  _mergedSettings: Settings,
): boolean {
  return !settingExistsInScope(key, settings);
}

/**
 * 获取用于显示的有效值，考虑继承
 * 始终返回布尔值（从不是 undefined）
 * @param key - 设置键名
 * @param settings - 设置对象
 * @param mergedSettings - 合并后的设置对象
 * @returns boolean 有效布尔值
 */
export function getEffectiveDisplayValue(
  key: string,
  settings: Settings,
  mergedSettings: Settings,
): boolean {
  return getSettingValue(key, settings, mergedSettings);
}

/**
 * 在修改前备份设置文件
 * 如果文件存在且备份不存在，则创建带 .orig 后缀的备份
 * @param filePath - 要备份的设置文件路径
 * @returns boolean 是否创建了备份
 */
export function backupSettingsFile(filePath: string): boolean {
  try {
    if (fs.existsSync(filePath)) {
      const backupPath = `${filePath}.orig`;
      if (!fs.existsSync(backupPath)) {
        fs.renameSync(filePath, backupPath);
        return true;
      }
    }
  } catch (_e) {
    // 忽略备份错误，继续而不备份
  }
  return false;
}

/** 仅用于测试的导出 */
export const TEST_ONLY = { clearFlattenedSchema };
