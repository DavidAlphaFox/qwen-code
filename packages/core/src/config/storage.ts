/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { getProjectHash, sanitizeCwd } from '../utils/paths.js';

export const QWEN_DIR = '.qwen';
export const GOOGLE_ACCOUNTS_FILENAME = 'google_accounts.json';
export const OAUTH_FILE = 'oauth_creds.json';
const TMP_DIR_NAME = 'tmp';
const BIN_DIR_NAME = 'bin';
const PROJECT_DIR_NAME = 'projects';
const IDE_DIR_NAME = 'ide';
const DEBUG_DIR_NAME = 'debug';

/**
 * 存储管理类
 * 提供项目相关目录和文件路径的管理功能
 */
export class Storage {
  private readonly targetDir: string;

  /**
   * 创建存储实例
   * @param targetDir - 目标目录
   */
  constructor(targetDir: string) {
    this.targetDir = targetDir;
  }

  /**
   * 获取全局 Qwen 目录路径
   * @returns 全局 Qwen 目录路径
   */
  static getGlobalQwenDir(): string {
    const homeDir = os.homedir();
    if (!homeDir) {
      return path.join(os.tmpdir(), '.qwen');
    }
    return path.join(homeDir, QWEN_DIR);
  }

  /**
   * 获取 MCP OAuth 令牌文件路径
   * @returns OAuth 令牌文件路径
   */
  static getMcpOAuthTokensPath(): string {
    return path.join(Storage.getGlobalQwenDir(), 'mcp-oauth-tokens.json');
  }

  /**
   * 获取全局设置文件路径
   * @returns 设置文件路径
   */
  static getGlobalSettingsPath(): string {
    return path.join(Storage.getGlobalQwenDir(), 'settings.json');
  }

  /**
   * 获取安装 ID 文件路径
   * @returns 安装 ID 文件路径
   */
  static getInstallationIdPath(): string {
    return path.join(Storage.getGlobalQwenDir(), 'installation_id');
  }

  /**
   * 获取 Google 账户文件路径
   * @returns Google 账户文件路径
   */
  static getGoogleAccountsPath(): string {
    return path.join(Storage.getGlobalQwenDir(), GOOGLE_ACCOUNTS_FILENAME);
  }

  /**
   * 获取用户命令目录路径
   * @returns 用户命令目录路径
   */
  static getUserCommandsDir(): string {
    return path.join(Storage.getGlobalQwenDir(), 'commands');
  }

  /**
   * 获取全局内存文件路径
   * @returns 内存文件路径
   */
  static getGlobalMemoryFilePath(): string {
    return path.join(Storage.getGlobalQwenDir(), 'memory.md');
  }

  /**
   * 获取全局临时目录路径
   * @returns 临时目录路径
   */
  static getGlobalTempDir(): string {
    return path.join(Storage.getGlobalQwenDir(), TMP_DIR_NAME);
  }

  /**
   * 获取全局调试目录路径
   * @returns 调试目录路径
   */
  static getGlobalDebugDir(): string {
    return path.join(Storage.getGlobalQwenDir(), DEBUG_DIR_NAME);
  }

  /**
   * 获取调试日志文件路径
   * @param sessionId - 会话 ID
   * @returns 调试日志文件路径
   */
  static getDebugLogPath(sessionId: string): string {
    return path.join(Storage.getGlobalDebugDir(), `${sessionId}.txt`);
  }

  /**
   * 获取全局 IDE 目录路径
   * @returns IDE 目录路径
   */
  static getGlobalIdeDir(): string {
    return path.join(Storage.getGlobalQwenDir(), IDE_DIR_NAME);
  }

  /**
   * 获取全局二进制文件目录路径
   * @returns 二进制文件目录路径
   */
  static getGlobalBinDir(): string {
    return path.join(Storage.getGlobalQwenDir(), BIN_DIR_NAME);
  }

  /**
   * 获取项目 Qwen 目录路径
   * @returns 项目 Qwen 目录路径
   */
  getQwenDir(): string {
    return path.join(this.targetDir, QWEN_DIR);
  }

  /**
   * 获取项目目录路径
   * @returns 项目目录路径
   */
  getProjectDir(): string {
    const projectId = sanitizeCwd(this.getProjectRoot());
    const projectsDir = path.join(Storage.getGlobalQwenDir(), PROJECT_DIR_NAME);
    return path.join(projectsDir, projectId);
  }

  /**
   * 获取项目临时目录路径
   * @returns 项目临时目录路径
   */
  getProjectTempDir(): string {
    const hash = getProjectHash(this.getProjectRoot());
    const tempDir = Storage.getGlobalTempDir();
    const targetDir = path.join(tempDir, hash);
    return targetDir;
  }

  /**
   * 确保项目临时目录存在
   */
  ensureProjectTempDirExists(): void {
    fs.mkdirSync(this.getProjectTempDir(), { recursive: true });
  }

  /**
   * 获取 OAuth 凭据文件路径
   * @returns OAuth 凭据文件路径
   */
  static getOAuthCredsPath(): string {
    return path.join(Storage.getGlobalQwenDir(), OAUTH_FILE);
  }

  /**
   * 获取项目根目录路径
   * @returns 项目根目录路径
   */
  getProjectRoot(): string {
    return this.targetDir;
  }

  /**
   * 获取历史记录目录路径
   * @returns 历史记录目录路径
   */
  getHistoryDir(): string {
    const hash = getProjectHash(this.getProjectRoot());
    const historyDir = path.join(Storage.getGlobalQwenDir(), 'history');
    const targetDir = path.join(historyDir, hash);
    return targetDir;
  }

  /**
   * 获取工作区设置文件路径
   * @returns 设置文件路径
   */
  getWorkspaceSettingsPath(): string {
    return path.join(this.getQwenDir(), 'settings.json');
  }

  /**
   * 获取项目命令目录路径
   * @returns 项目命令目录路径
   */
  getProjectCommandsDir(): string {
    return path.join(this.getQwenDir(), 'commands');
  }

  /**
   * 获取项目临时检查点目录路径
   * @returns 检查点目录路径
   */
  getProjectTempCheckpointsDir(): string {
    return path.join(this.getProjectTempDir(), 'checkpoints');
  }

  /**
   * 获取扩展目录路径
   * @returns 扩展目录路径
   */
  getExtensionsDir(): string {
    return path.join(this.getQwenDir(), 'extensions');
  }

  /**
   * 获取扩展配置文件路径
   * @returns 扩展配置文件路径
   */
  getExtensionsConfigPath(): string {
    return path.join(this.getExtensionsDir(), 'qwen-extension.json');
  }

  /**
   * 获取用户技能目录路径
   * @returns 用户技能目录路径
   */
  getUserSkillsDir(): string {
    return path.join(Storage.getGlobalQwenDir(), 'skills');
  }

  /**
   * 获取历史记录文件路径
   * @returns 历史记录文件路径
   */
  getHistoryFilePath(): string {
    return path.join(this.getProjectTempDir(), 'shell_history');
  }
}
