/**
 * @file telemetry_utils.js
 * @description 遥测工具模块 - 提供遥测数据收集所需的工具函数
 * 包括二进制文件下载、文件操作、进程管理等功能
 */

#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');

/**
 * 根据项目根路径生成唯一的哈希值
 * 在 Windows 上，路径不区分大小写，因此我们将其规范化为小写
 * 以确保相同的物理路径始终产生相同的哈希值
 * 此逻辑必须与 packages/core/src/utils/paths.ts 中的 getProjectHash() 保持一致
 * @param {string} projectRoot - 项目根目录的绝对路径
 * @returns {string} SHA256 哈希值的十六进制表示
 * @example
 * const hash = getProjectHash('/Users/username/project');
 * // 返回类似 'a1b2c3d4e5f6...'
 */
function getProjectHash(projectRoot) {
  // On Windows, normalize path to lowercase for case-insensitive matching
  const normalizedPath =
    os.platform() === 'win32' ? projectRoot.toLowerCase() : projectRoot;
  return crypto.createHash('sha256').update(normalizedPath).digest('hex');
}

const projectHash = getProjectHash(projectRoot);

// User-level .gemini directory in home
const USER_GEMINI_DIR = path.join(os.homedir(), '.qwen');
// Project-level .gemini directory in the workspace
const WORKSPACE_QWEN_DIR = path.join(projectRoot, '.qwen');

// Telemetry artifacts are stored in a hashed directory under the user's ~/.qwen/tmp
/**
 * 遥测数据目录 - 存储在用户主目录下的 .qwen/tmp 中
 * @type {string}
 */
export const OTEL_DIR = path.join(USER_GEMINI_DIR, 'tmp', projectHash, 'otel');
/**
 * 二进制文件目录 - 存储下载的 otelcol、jaeger 等二进制文件
 * @type {string}
 */
export const BIN_DIR = path.join(OTEL_DIR, 'bin');

// Workspace settings remain in the project's .gemini directory
/**
 * 工作区设置文件路径 - 存储在工作区的 .qwen 目录下
 * @type {string}
 */
export const WORKSPACE_SETTINGS_FILE = path.join(
  WORKSPACE_QWEN_DIR,
  'settings.json',
);

/**
 * 从指定 URL 获取 JSON 数据
 * 使用 curl 下载并解析 JSON 响应
 * @param {string} url - 要请求的 URL 地址
 * @returns {Promise<object>} 解析后的 JSON 对象
 * @throws {Error} 如果请求失败或 JSON 解析失败
 * @example
 * const data = await getJson('https://api.github.com/repos/owner/repo/releases');
 */
export function getJson(url) {
  const tmpFile = path.join(
    os.tmpdir(),
    `qwen-code-releases-${Date.now()}.json`,
  );
  try {
    const result = spawnSync(
      'curl',
      ['-sL', '-H', 'User-Agent: qwen-code-dev-script', '-o', tmpFile, url],
      { stdio: 'pipe', encoding: 'utf-8' },
    );
    if (result.status !== 0) {
      throw new Error(result.stderr);
    }
    const content = fs.readFileSync(tmpFile, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    console.error(`Failed to fetch or parse JSON from ${url}`);
    throw e;
  } finally {
    if (fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
  }
}

/**
 * 注册清理函数
 * 在进程退出时自动清理遥测相关的进程和文件描述符
 * @param {function} getProcesses - 获取要终止的进程列表的函数
 * @param {function} getLogFileDescriptors - 获取要关闭的文件描述符列表的函数
 * @param {string} originalSandboxSetting - 原始沙箱设置值，用于恢复
 */
export function registerCleanup(
  getProcesses,
  getLogFileDescriptors,
  originalSandboxSetting,
) {
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;

    console.log('\n👋 Shutting down...');

    manageTelemetrySettings(false, null, originalSandboxSetting);

    const processes = getProcesses ? getProcesses() : [];
    processes.forEach((proc) => {
      if (proc && proc.pid) {
        const name = path.basename(proc.spawnfile);
        try {
          console.log(`🛑 Stopping ${name} (PID: ${proc.pid})...`);
          process.kill(proc.pid, 'SIGTERM');
          console.log(`✅ ${name} stopped.`);
        } catch (e) {
          if (e.code !== 'ESRCH') {
            console.error(`Error stopping ${name}: ${e.message}`);
          }
        }
      }
    });

    const logFileDescriptors = getLogFileDescriptors
      ? getLogFileDescriptors()
      : [];
    logFileDescriptors.forEach((fd) => {
      if (fd) {
        try {
          fs.closeSync(fd);
        } catch (_) {
          /* no-op */
        }
      }
    });
  };

  process.on('exit', cleanup);
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    cleanup();
    process.exit(1);
  });
}
