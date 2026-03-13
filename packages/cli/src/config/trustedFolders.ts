/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';
import {
  FatalConfigError,
  getErrorMessage,
  isWithinRoot,
  ideContextStore,
} from '@qwen-code/qwen-code-core';
import type { Settings } from './settings.js';
import stripJsonComments from 'strip-json-comments';
import { writeStderrLine } from '../utils/stdioHelpers.js';

/** 可信文件夹文件名 */
export const TRUSTED_FOLDERS_FILENAME = 'trustedFolders.json';
/** 设置目录名称 */
export const SETTINGS_DIRECTORY_NAME = '.qwen';
/** 用户设置目录路径 */
export const USER_SETTINGS_DIR = path.join(homedir(), SETTINGS_DIRECTORY_NAME);

/**
 * 获取可信文件夹配置文件的路径
 * @returns 可信文件夹配置文件的完整路径
 */
export function getTrustedFoldersPath(): string {
  if (process.env['QWEN_CODE_TRUSTED_FOLDERS_PATH']) {
    return process.env['QWEN_CODE_TRUSTED_FOLDERS_PATH'];
  }
  return path.join(USER_SETTINGS_DIR, TRUSTED_FOLDERS_FILENAME);
}

/**
 * 信任级别枚举
 */
export enum TrustLevel {
  TRUST_FOLDER = 'TRUST_FOLDER',
  TRUST_PARENT = 'TRUST_PARENT',
  DO_NOT_TRUST = 'DO_NOT_TRUST',
}

/**
 * 信任规则接口
 */
export interface TrustRule {
  path: string;
  trustLevel: TrustLevel;
}

/**
 * 可信文件夹错误接口
 */
export interface TrustedFoldersError {
  message: string;
  path: string;
}

/**
 * 可信文件夹文件接口
 */
export interface TrustedFoldersFile {
  config: Record<string, TrustLevel>;
  path: string;
}

/**
 * 信任结果接口
 */
export interface TrustResult {
  isTrusted: boolean | undefined;
  source: 'ide' | 'file' | undefined;
}

/**
 * 已加载的可信文件夹类
 * 管理可信文件夹配置和信任判断逻辑
 */
export class LoadedTrustedFolders {
  constructor(
    readonly user: TrustedFoldersFile,
    readonly errors: TrustedFoldersError[],
  ) {}

  get rules(): TrustRule[] {
    return Object.entries(this.user.config).map(([path, trustLevel]) => ({
      path,
      trustLevel,
    }));
  }

  /**
   * 判断路径是否应该被"信任"。此函数仅在文件夹信任设置激活时调用。
   * @param location - 要检查的路径
   * @returns 是否信任该路径，返回 undefined 表示不确定
   */
  isPathTrusted(location: string): boolean | undefined {
    const trustedPaths: string[] = [];
    const untrustedPaths: string[] = [];

    for (const rule of this.rules) {
      switch (rule.trustLevel) {
        case TrustLevel.TRUST_FOLDER:
          trustedPaths.push(rule.path);
          break;
        case TrustLevel.TRUST_PARENT:
          trustedPaths.push(path.dirname(rule.path));
          break;
        case TrustLevel.DO_NOT_TRUST:
          untrustedPaths.push(rule.path);
          break;
        default:
          // Do nothing for unknown trust levels.
          break;
      }
    }

    for (const trustedPath of trustedPaths) {
      if (isWithinRoot(location, trustedPath)) {
        return true;
      }
    }

    for (const untrustedPath of untrustedPaths) {
      if (path.normalize(location) === path.normalize(untrustedPath)) {
        return false;
      }
    }

    return undefined;
  }

  setValue(path: string, trustLevel: TrustLevel): void {
    this.user.config[path] = trustLevel;
    saveTrustedFolders(this.user);
  }
}

let loadedTrustedFolders: LoadedTrustedFolders | undefined;

/**
 * 仅供测试使用
 * 重置可信文件夹配置的内存缓存
 */
export function resetTrustedFoldersForTesting(): void {
  loadedTrustedFolders = undefined;
}

/**
 * 加载可信文件夹配置
 * @returns 已加载的可信文件夹配置对象
 */
export function loadTrustedFolders(): LoadedTrustedFolders {
  if (loadedTrustedFolders) {
    return loadedTrustedFolders;
  }

  const errors: TrustedFoldersError[] = [];
  let userConfig: Record<string, TrustLevel> = {};

  const userPath = getTrustedFoldersPath();

  // Load user trusted folders
  try {
    if (fs.existsSync(userPath)) {
      const content = fs.readFileSync(userPath, 'utf-8');
      const parsed: unknown = JSON.parse(stripJsonComments(content));

      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        errors.push({
          message: 'Trusted folders file is not a valid JSON object.',
          path: userPath,
        });
      } else {
        userConfig = parsed as Record<string, TrustLevel>;
      }
    }
  } catch (error: unknown) {
    errors.push({
      message: getErrorMessage(error),
      path: userPath,
    });
  }

  loadedTrustedFolders = new LoadedTrustedFolders(
    { path: userPath, config: userConfig },
    errors,
  );
  return loadedTrustedFolders;
}

/**
 * 保存可信文件夹配置到文件
 * @param trustedFoldersFile - 可信文件夹文件对象
 */
export function saveTrustedFolders(
  trustedFoldersFile: TrustedFoldersFile,
): void {
  try {
    // Ensure the directory exists
    const dirPath = path.dirname(trustedFoldersFile.path);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    fs.writeFileSync(
      trustedFoldersFile.path,
      JSON.stringify(trustedFoldersFile.config, null, 2),
      { encoding: 'utf-8', mode: 0o600 },
    );
  } catch (error) {
    writeStderrLine('Error saving trusted folders file.');
    writeStderrLine(error instanceof Error ? error.message : String(error));
  }
}

/** 根据当前应用的设置，判断文件夹信任功能是否启用 */
export function isFolderTrustEnabled(settings: Settings): boolean {
  const folderTrustSetting = settings.security?.folderTrust?.enabled ?? false;
  return folderTrustSetting;
}

function getWorkspaceTrustFromLocalConfig(
  trustConfig?: Record<string, TrustLevel>,
): TrustResult {
  const folders = loadTrustedFolders();

  if (trustConfig) {
    folders.user.config = trustConfig;
  }

  if (folders.errors.length > 0) {
    const errorMessages = folders.errors.map(
      (error) => `Error in ${error.path}: ${error.message}`,
    );
    throw new FatalConfigError(
      `${errorMessages.join('\n')}\nPlease fix the configuration file and try again.`,
    );
  }

  const isTrusted = folders.isPathTrusted(process.cwd());
  return {
    isTrusted,
    source: isTrusted !== undefined ? 'file' : undefined,
  };
}

/**
 * 判断工作区是否受信任
 * 优先级：IDE 设置 > 本地用户配置
 * @param settings - 用户设置对象
 * @param trustConfig - 可选的信任配置覆盖
 * @returns 信任结果对象
 */
export function isWorkspaceTrusted(
  settings: Settings,
  trustConfig?: Record<string, TrustLevel>,
): TrustResult {
  if (!isFolderTrustEnabled(settings)) {
    return { isTrusted: true, source: undefined };
  }

  const ideTrust = ideContextStore.get()?.workspaceState?.isTrusted;
  if (ideTrust !== undefined) {
    return { isTrusted: ideTrust, source: 'ide' };
  }

  // Fall back to the local user configuration
  return getWorkspaceTrustFromLocalConfig(trustConfig);
}
