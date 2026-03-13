/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  readPackageUp,
  type PackageJson as BasePackageJson,
} from 'read-package-up';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * 扩展的 package.json 类型
 * 在基础类型上添加了沙箱镜像配置
 */
export type PackageJson = BasePackageJson & {
  /** 沙箱镜像 URI 配置 */
  config?: {
    /** 沙箱镜像 URI */
    sandboxImageUri?: string;
  };
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** 缓存的 package.json 对象 */
let packageJson: PackageJson | undefined;

/**
 * 获取 package.json 内容
 * 使用缓存机制避免重复读取文件
 * @returns Promise<PackageJson | undefined> package.json 对象，如果读取失败则返回 undefined
 */
export async function getPackageJson(): Promise<PackageJson | undefined> {
  if (packageJson) {
    return packageJson;
  }

  const result = await readPackageUp({ cwd: __dirname });
  if (!result) {
    // TODO: Maybe bubble this up as an error.
    return;
  }

  packageJson = result.packageJson;
  return packageJson;
}
