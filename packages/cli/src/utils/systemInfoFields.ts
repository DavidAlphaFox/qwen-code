/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ExtendedSystemInfo } from './systemInfo.js';
import { t } from '../i18n/index.js';
import { isCodingPlanConfig } from '../constants/codingPlan.js';

/**
 * 系统信息字段配置
 */
export interface SystemInfoField {
  /** 字段标签 */
  label: string;
  /** 字段键名 */
  key: keyof ExtendedSystemInfo;
}

/** 系统信息显示字段 */
export interface SystemInfoDisplayField {
  /** 字段标签 */
  label: string;
  /** 字段值 */
  value: string;
}

/**
 * 获取系统信息字段
 * @param info - 扩展系统信息
 * @returns SystemInfoDisplayField[] 显示字段数组
 */
export function getSystemInfoFields(
  info: ExtendedSystemInfo,
): SystemInfoDisplayField[] {
  const fields: SystemInfoDisplayField[] = [];

  addField(fields, t('Qwen Code'), formatCliVersion(info));
  addField(fields, t('Runtime'), formatRuntime(info));
  addField(fields, t('IDE Client'), info.ideClient);
  addField(fields, t('OS'), formatOs(info));
  addField(fields, t('Auth'), formatAuth(info));
  addField(fields, t('Base URL'), formatBaseUrl(info));
  addField(fields, t('Model'), info.modelVersion);
  addField(fields, t('Session ID'), info.sessionId);
  addField(fields, t('Sandbox'), info.sandboxEnv);
  addField(fields, t('Proxy'), formatProxy(info.proxy));
  addField(fields, t('Memory Usage'), info.memoryUsage);

  return fields;
}

/**
 * 添加字段到字段数组
 * @param fields - 字段数组
 * @param label - 字段标签
 * @param value - 字段值
 */
function addField(
  fields: SystemInfoDisplayField[],
  label: string,
  value: string,
): void {
  if (value) {
    fields.push({ label, value });
  }
}

/**
 * 格式化 CLI 版本
 * @param info - 扩展系统信息
 * @returns string 格式化的版本字符串
 */
function formatCliVersion(info: ExtendedSystemInfo): string {
  if (!info.cliVersion) {
    return '';
  }
  if (!info.gitCommit) {
    return info.cliVersion;
  }
  return `${info.cliVersion} (${info.gitCommit})`;
}

/**
 * 格式化运行时信息
 * @param info - 扩展系统信息
 * @returns string 格式化的运行时字符串
 */
function formatRuntime(info: ExtendedSystemInfo): string {
  if (!info.nodeVersion && !info.npmVersion) {
    return '';
  }
  const node = info.nodeVersion ? `Node.js ${info.nodeVersion}` : '';
  const npm = info.npmVersion ? `npm ${info.npmVersion}` : '';
  return joinParts([node, npm], ' / ');
}

/**
 * 格式化操作系统信息
 * @param info - 扩展系统信息
 * @returns string 格式化的操作系统字符串
 */
function formatOs(info: ExtendedSystemInfo): string {
  return joinParts(
    [info.osPlatform, info.osArch, formatOsRelease(info.osRelease)],
    ' ',
  ).trim();
}

/**
 * 格式化操作系统版本
 * @param release - 操作系统版本
 * @returns string 格式化的版本字符串
 */
function formatOsRelease(release: string): string {
  if (!release) {
    return '';
  }
  return `(${release})`;
}

/**
 * 格式化认证信息
 * @param info - 扩展系统信息
 * @returns string 格式化的认证字符串
 */
function formatAuth(info: ExtendedSystemInfo): string {
  if (!info.selectedAuthType) {
    return '';
  }

  if (isCodingPlanConfig(info.baseUrl, info.apiKeyEnvKey)) {
    return t('Alibaba Cloud Coding Plan');
  }

  if (
    info.selectedAuthType.startsWith('oauth') ||
    info.selectedAuthType === 'qwen-oauth'
  ) {
    return 'Qwen OAuth';
  }

  return `API Key - ${info.selectedAuthType}`;
}

/**
 * 格式化基础 URL
 * @param info - 扩展系统信息
 * @returns string 格式化的基础 URL
 */
function formatBaseUrl(info: ExtendedSystemInfo): string {
  if (!info.selectedAuthType || !info.baseUrl) {
    return '';
  }

  if (
    info.selectedAuthType.startsWith('oauth') ||
    info.selectedAuthType === 'qwen-oauth'
  ) {
    return '';
  }

  return info.baseUrl;
}

/**
 * 格式化代理信息
 * @param proxy - 代理字符串
 * @returns string 格式化的代理字符串
 */
function formatProxy(proxy?: string): string {
  if (!proxy) {
    return 'no proxy';
  }
  return redactProxy(proxy);
}

/**
 * 编辑代理信息（隐藏敏感信息）
 * @param proxy - 代理字符串
 * @returns string 编辑后的代理字符串
 */
function redactProxy(proxy: string): string {
  try {
    const url = new URL(proxy);
    if (url.username || url.password) {
      url.username = url.username ? '***' : '';
      url.password = url.password ? '***' : '';
    }
    return url.toString();
  } catch {
    return proxy.replace(/\/\/[^/]*@/, '//***@');
  }
}

/**
 * 连接字符串数组
 * @param parts - 字符串数组
 * @param separator - 分隔符
 * @returns string 连接后的字符串
 */
function joinParts(parts: string[], separator: string): string {
  return parts.filter((part) => part).join(separator);
}
