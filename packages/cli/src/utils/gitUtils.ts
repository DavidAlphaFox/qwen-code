/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import { ProxyAgent } from 'undici';
import { createDebugLogger } from '@qwen-code/qwen-code-core';

const debugLogger = createDebugLogger('GIT');

/**
 * 检查目录是否在托管于 GitHub 的 git 仓库中
 * @returns boolean 如果目录在具有 github.com 远程的 git 仓库中则返回 true，否则返回 false
 */
export const isGitHubRepository = (): boolean => {
  try {
    const remotes = (
      execSync('git remote -v', {
        encoding: 'utf-8',
      }) || ''
    ).trim();

    const pattern = /github\.com/;

    return pattern.test(remotes);
  } catch (_error) {
    // 如果发生任何文件系统错误，假设不是 git 仓库
    debugLogger.debug(`Failed to get git remote:`, _error);
    return false;
  }
};

/**
 * getGitRepoRoot 返回 git 仓库的根目录
 * @returns string git 仓库根目录的路径
 * @throws 如果 exec 命令失败则抛出错误
 */
export const getGitRepoRoot = (): string => {
  const gitRepoRoot = (
    execSync('git rev-parse --show-toplevel', {
      encoding: 'utf-8',
    }) || ''
  ).trim();

  if (!gitRepoRoot) {
    throw new Error(`Git repo returned empty value`);
  }

  return gitRepoRoot;
};

/**
 * getLatestGitHubRelease 返回最新发布标签
 * @returns string 发布标签（例如 "v1.2.3"）
 */
export const getLatestGitHubRelease = async (
  proxy?: string,
): Promise<string> => {
  try {
    const controller = new AbortController();

    const endpoint = `https://api.github.com/repos/QwenLM/qwen-code-action/releases/latest`;

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      dispatcher: proxy ? new ProxyAgent(proxy) : undefined,
      signal: AbortSignal.any([AbortSignal.timeout(30_000), controller.signal]),
    } as RequestInit);

    if (!response.ok) {
      throw new Error(
        `Invalid response code: ${response.status} - ${response.statusText}`,
      );
    }

    const releaseTag = (await response.json()).tag_name;
    if (!releaseTag) {
      throw new Error(`Response did not include tag_name field`);
    }
    return releaseTag;
  } catch (_error) {
    debugLogger.debug(
      `Failed to determine latest qwen-code-action release:`,
      _error,
    );
    throw new Error(
      `Unable to determine the latest qwen-code-action release on GitHub.`,
    );
  }
};

/**
 * getGitHubRepoInfo 返回 GitHub 仓库的所有者和仓库名
 * @returns { owner: string; repo: string } 仓库的所有者和名称
 * @throws 如果 exec 命令失败则抛出错误
 */
export function getGitHubRepoInfo(): { owner: string; repo: string } {
  const remoteUrl = execSync('git remote get-url origin', {
    encoding: 'utf-8',
  }).trim();

  // 处理 SCP 风格的 SSH URL（git@github.com:owner/repo.git）
  let urlToParse = remoteUrl;
  if (remoteUrl.startsWith('git@github.com:')) {
    urlToParse = remoteUrl.replace('git@github.com:', '');
  } else if (remoteUrl.startsWith('git@')) {
    // 其他提供商（GitLab、Bitbucket 等）的 SSH URL
    throw new Error(
      `Owner & repo could not be extracted from remote URL: ${remoteUrl}`,
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlToParse, 'https://github.com');
  } catch {
    throw new Error(
      `Owner & repo could not be extracted from remote URL: ${remoteUrl}`,
    );
  }

  if (parsedUrl.host !== 'github.com') {
    throw new Error(
      `Owner & repo could not be extracted from remote URL: ${remoteUrl}`,
    );
  }

  const parts = parsedUrl.pathname.split('/').filter((part) => part !== '');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `Owner & repo could not be extracted from remote URL: ${remoteUrl}`,
    );
  }

  return { owner: parts[0], repo: parts[1].replace(/\.git$/, '') };
}
