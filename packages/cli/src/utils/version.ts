/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getPackageJson } from './package.js';

/**
 * 获取 CLI 版本号
 * 首先检查 CLI_VERSION 环境变量，如果未设置则从 package.json 获取
 * @returns Promise<string> CLI 版本号字符串
 */
export async function getCliVersion(): Promise<string> {
  const pkgJson = await getPackageJson();
  return process.env['CLI_VERSION'] || pkgJson?.version || 'unknown';
}
