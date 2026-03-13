/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * 自动补全菜单项类型定义
 */

import type { ReactNode } from 'react';

/**
 * 自动补全项类型分类
 * @typedef {'file' | 'folder' | 'symbol' | 'command' | 'variable' | 'info'} CompletionItemType
 * @description 定义自动补全菜单中项目的类型：文件、文件夹、符号、命令、变量、信息
 */
export type CompletionItemType =
  | 'file'
  | 'folder'
  | 'symbol'
  | 'command'
  | 'variable'
  | 'info';

/**
 * 自动补全菜单项
 * @interface CompletionItem
 * @description 定义自动补全菜单中的单个选项，包含显示信息和选中后的行为
 */
export interface CompletionItem {
  /** 唯一标识符 */
  id: string;
  /** 显示标签 */
  label: string;
  /** 可选的描述信息，显示在标签下方 */
  description?: string;
  /** 可选的图标，显示在标签左侧 */
  icon?: ReactNode;
  /** 补全项的类型 */
  type: CompletionItemType;
  /** 选中后插入到输入框的值（如文件名或命令） */
  value?: string;
  /** 文件的完整路径（用于构建 @文件名 -> 完整路径 的映射） */
  path?: string;
  /** 分组名称，用于在补全菜单中对项目进行分组 */
  group?: string;
}
