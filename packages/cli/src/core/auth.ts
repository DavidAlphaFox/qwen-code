/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type AuthType,
  type Config,
  getErrorMessage,
  logAuth,
  AuthEvent,
} from '@qwen-code/qwen-code-core';

/**
 * 处理初始认证流程
 * @param config - 应用程序配置
 * @param authType - 选择的认证类型
 * @returns 如果认证失败返回错误消息，否则返回 null
 */
export async function performInitialAuth(
  config: Config,
  authType: AuthType | undefined,
): Promise<string | null> {
  if (!authType) {
    return null;
  }

  try {
    await config.refreshAuth(authType, true);
    // The console.log is intentionally left out here.
    // We can add a dedicated startup message later if needed.

    // Log authentication success
    const authEvent = new AuthEvent(authType, 'auto', 'success');
    logAuth(config, authEvent);
  } catch (e) {
    const errorMessage = `Failed to login. Message: ${getErrorMessage(e)}`;

    // Log authentication failure
    const authEvent = new AuthEvent(authType, 'auto', 'error', errorMessage);
    logAuth(config, authEvent);

    return errorMessage;
  }

  return null;
}
