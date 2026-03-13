/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

/**
 * 平台类型
 * @typedef {'vscode' | 'chrome' | 'web' | 'share'} PlatformType
 * @description webui库支持的平台类型：vscode（VS Code扩展）、chrome（Chrome扩展）、web（网页）、share（分享页面）
 */
export type PlatformType = 'vscode' | 'chrome' | 'web' | 'share';

/**
 * 平台上下文接口
 * @interface PlatformContextValue
 * @description 用于跨平台组件复用的平台上下文接口，每个平台适配器都需要实现此接口
 */
export interface PlatformContextValue {
  /** 当前平台标识符 */
  platform: PlatformType;

  /** 向平台宿主发送消息 */
  postMessage: (message: unknown) => void;

  /** 订阅来自平台宿主的消息，返回取消订阅的函数 */
  onMessage: (handler: (message: unknown) => void) => () => void;

  /** 在平台的编辑器中打开文件（可选） */
  openFile?: (path: string) => void;

  /** 打开文件的差异视图（可选） */
  openDiff?: (
    path: string,
    oldText: string | null | undefined,
    newText: string | undefined,
  ) => void;

  /** 打开临时文件并显示给定内容（可选） */
  openTempFile?: (content: string, fileName?: string) => void;

  /** 触发文件附加对话框（可选） */
  attachFile?: () => void;

  /** 触发平台登录流程（可选） */
  login?: () => void;

  /** 复制文本到剪贴板 */
  copyToClipboard?: (text: string) => Promise<void>;

  /** 获取平台特定资源的URL（如图标等） */
  getResourceUrl?: (resourceName: string) => string | undefined;

  /** 平台特定功能标志 */
  features?: {
    /** 是否可以打开文件 */
    canOpenFile?: boolean;
    /** 是否可以打开差异视图 */
    canOpenDiff?: boolean;
    /** 是否可以打开临时文件 */
    canOpenTempFile?: boolean;
    /** 是否可以附加文件 */
    canAttachFile?: boolean;
    /** 是否可以登录 */
    canLogin?: boolean;
    /** 是否可以复制 */
    canCopy?: boolean;
  };
}

/**
 * 默认的空实现，用于不支持消息功能的平台
 */
const defaultContext: PlatformContextValue = {
  platform: 'web',
  postMessage: () => {},
  onMessage: () => () => {},
};

/**
 * 平台上下文，用于访问平台特定功能
 */
export const PlatformContext =
  createContext<PlatformContextValue>(defaultContext);

/**
 * 访问平台上下文的 Hook
 * @function usePlatform
 * @description 用于在组件中获取平台上下文，提供跨平台能力
 * @returns {PlatformContextValue} 平台上下文对象，包含平台类型和各种平台操作方法
 *
 * @example
 * const { platform, postMessage, openFile } = usePlatform();
 * if (platform === 'vscode') {
 *   openFile('/path/to/file');
 * }
 */
export function usePlatform(): PlatformContextValue {
  return useContext(PlatformContext);
}

/**
 * Provider 组件属性
 * @interface PlatformProviderProps
 * @description PlatformProvider 组件的属性定义
 */
export interface PlatformProviderProps {
  /** 子组件 */
  children: ReactNode;
  /** 平台上下文值 */
  value: PlatformContextValue;
}

/**
 * 平台上下文 Provider 组件
 * @component
 * @description 提供平台上下文给子组件，用于跨平台功能抽象
 * @param {PlatformProviderProps} props - 组件属性
 * @returns {JSX.Element} React元素
 *
 * @example
 * const platformContext = {
 *   platform: 'vscode',
 *   postMessage: (msg) => vscode.postMessage(msg),
 *   onMessage: (handler) => {
 *     window.addEventListener('message', handler);
 *     return () => window.removeEventListener('message', handler);
 *   },
 * };
 *
 * <PlatformProvider value={platformContext}>
 *   <App />
 * </PlatformProvider>
 */
export function PlatformProvider({ children, value }: PlatformProviderProps) {
  return (
    <PlatformContext.Provider value={value}>
      {children}
    </PlatformContext.Provider>
  );
}
