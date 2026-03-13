/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec, execSync, spawn, type ChildProcess } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { quote, parse } from 'shell-quote';
import {
  USER_SETTINGS_DIR,
  SETTINGS_DIRECTORY_NAME,
} from '../config/settings.js';
import { promisify } from 'node:util';
import type { Config, SandboxConfig } from '@qwen-code/qwen-code-core';
import { FatalSandboxError } from '@qwen-code/qwen-code-core';
import { randomBytes } from 'node:crypto';
import { writeStderrLine } from './stdioHelpers.js';

const execAsync = promisify(exec);

/**
 * 获取容器内的路径
 * 在 Windows 上将主机路径转换为 WSL 格式的路径
 * @param hostPath - 主机上的路径
 * @returns string 转换后的路径
 */
function getContainerPath(hostPath: string): string {
  if (os.platform() !== 'win32') {
    return hostPath;
  }

  const withForwardSlashes = hostPath.replace(/\\/g, '/');
  const match = withForwardSlashes.match(/^([A-Z]):\/(.*)/i);
  if (match) {
    return `/${match[1].toLowerCase()}/${match[2]}`;
  }
  return hostPath;
}

const LOCAL_DEV_SANDBOX_IMAGE_NAME = 'qwen-code-sandbox';
const SANDBOX_NETWORK_NAME = 'qwen-code-sandbox';
const SANDBOX_PROXY_NAME = 'qwen-code-sandbox-proxy';

/** 内置的 Seatbelt 配置文件列表 */
const BUILTIN_SEATBELT_PROFILES = [
  'permissive-open',
  'permissive-closed',
  'permissive-proxied',
  'restrictive-open',
  'restrictive-closed',
  'restrictive-proxied',
];

/**
 * 确定是否应使用当前用户的 UID 和 GID 运行沙箱容器
 * 这在 Linux 系统上使用 rootful Docker 且未配置 userns-remap 时通常很必要，以避免挂载卷的权限问题
 * 行为由 SANDBOX_SET_UID_GID 环境变量控制：
 * - 如果为 "1" 或 "true"，返回 true
 * - 如果为 "0" 或 "false"，返回 false
 * - 如果未设置：
 *   - Linux 上默认为 true
 *   - 其他系统默认为 false
 * @returns Promise<boolean> 如果应使用当前用户的 UID/GID 则返回 true，否则返回 false
 */
async function shouldUseCurrentUserInSandbox(): Promise<boolean> {
  const envVar = process.env['SANDBOX_SET_UID_GID']?.toLowerCase().trim();

  if (envVar === '1' || envVar === 'true') {
    return true;
  }
  if (envVar === '0' || envVar === 'false') {
    return false;
  }

  if (os.platform() === 'linux') {
    const debugEnv = [process.env['DEBUG'], process.env['DEBUG_MODE']].some(
      (v) => v === 'true' || v === '1',
    );
    if (debugEnv) {
      // 使用 stderr 以免弄乱正常的 STDOUT 输出（例如在 --prompt 运行中）
      writeStderrLine(
        'INFO: Using current user UID/GID in Linux sandbox. Set SANDBOX_SET_UID_GID=false to disable.',
      );
    }
    return true;
  }

  return false;
}

// docker 不允许容器名称包含 ':' 或 '/'，因此解析这些字符以缩短名称
/**
 * 解析镜像名称
 * 移除路径前缀并处理标签
 * @param image - 镜像名称
 * @returns string 解析后的镜像名称
 */
function parseImageName(image: string): string {
  const [fullName, tag] = image.split(':');
  const name = fullName.split('/').at(-1) ?? 'unknown-image';
  return tag ? `${name}-${tag}` : name;
}

/**
 * 获取端口列表
 * 从 SANDBOX_PORTS 环境变量解析
 * @returns string[] 端口字符串数组
 */
function ports(): string[] {
  return (process.env['SANDBOX_PORTS'] ?? '')
    .split(',')
    .filter((p) => p.trim())
    .map((p) => p.trim());
}

/**
 * 生成容器入口点命令
 * @param workdir - 工作目录
 * @param cliArgs - CLI 参数
 * @returns string[] 入口点命令数组
 */
function entrypoint(workdir: string, cliArgs: string[]): string[] {
  const isWindows = os.platform() === 'win32';
  const containerWorkdir = getContainerPath(workdir);
  const shellCmds = [];
  const pathSeparator = isWindows ? ';' : ':';

  let pathSuffix = '';
  if (process.env['PATH']) {
    const paths = process.env['PATH'].split(pathSeparator);
    for (const p of paths) {
      const containerPath = getContainerPath(p);
      if (
        containerPath.toLowerCase().startsWith(containerWorkdir.toLowerCase())
      ) {
        pathSuffix += `:${containerPath}`;
      }
    }
  }
  if (pathSuffix) {
    shellCmds.push(`export PATH="$PATH${pathSuffix}";`);
  }

  let pythonPathSuffix = '';
  if (process.env['PYTHONPATH']) {
    const paths = process.env['PYTHONPATH'].split(pathSeparator);
    for (const p of paths) {
      const containerPath = getContainerPath(p);
      if (
        containerPath.toLowerCase().startsWith(containerWorkdir.toLowerCase())
      ) {
        pythonPathSuffix += `:${containerPath}`;
      }
    }
  }
  if (pythonPathSuffix) {
    shellCmds.push(`export PYTHONPATH="$PYTHONPATH${pythonPathSuffix}";`);
  }

  const projectSandboxBashrc = path.join(
    SETTINGS_DIRECTORY_NAME,
    'sandbox.bashrc',
  );
  if (fs.existsSync(projectSandboxBashrc)) {
    shellCmds.push(`source ${getContainerPath(projectSandboxBashrc)};`);
  }

  ports().forEach((p) =>
    shellCmds.push(
      `socat TCP4-LISTEN:${p},bind=$(hostname -i),fork,reuseaddr TCP4:127.0.0.1:${p} 2> /dev/null &`,
    ),
  );

  const quotedCliArgs = cliArgs.slice(2).map((arg) => quote([arg]));
  const cliCmd =
    process.env['NODE_ENV'] === 'development'
      ? process.env['DEBUG']
        ? 'npm run debug --'
        : 'npm rebuild && npm run start --'
      : process.env['DEBUG']
        ? `node --inspect-brk=0.0.0.0:${process.env['DEBUG_PORT'] || '9229'} $(which qwen)`
        : 'qwen';

  const args = [...shellCmds, cliCmd, ...quotedCliArgs];
  return ['bash', '-c', args.join(' ')];
}

/**
 * 启动沙箱环境
 * 根据配置启动 Docker/Podman 容器或使用 macOS Seatbelt
 * @param config - 沙箱配置
 * @param nodeArgs - 额外的 Node.js 参数
 * @param cliConfig - CLI 配置
 * @param cliArgs - CLI 参数
 * @returns Promise<number> 进程退出代码
 */
export async function start_sandbox(
  config: SandboxConfig,
  nodeArgs: string[] = [],
  cliConfig?: Config,
  cliArgs: string[] = [],
): Promise<number> {
  if (config.command === 'sandbox-exec') {
    // 禁止 BUILD_SANDBOX
    if (process.env['BUILD_SANDBOX']) {
      throw new FatalSandboxError(
        'Cannot BUILD_SANDBOX when using macOS Seatbelt',
      );
    }

    const profile = (process.env['SEATBELT_PROFILE'] ??= 'permissive-open');
    let profileFile = fileURLToPath(
      new URL(`sandbox-macos-${profile}.sb`, import.meta.url),
    );
    // 如果配置名称不被识别，则在项目设置目录下查找文件
    if (!BUILTIN_SEATBELT_PROFILES.includes(profile)) {
      profileFile = path.join(
        SETTINGS_DIRECTORY_NAME,
        `sandbox-macos-${profile}.sb`,
      );
    }
    if (!fs.existsSync(profileFile)) {
      throw new FatalSandboxError(
        `Missing macos seatbelt profile file '${profileFile}'`,
      );
    }
    // 在 STDERR 上记录以免弄乱 STDOUT 上的输出
    writeStderrLine(`using macos seatbelt (profile: ${profile}) ...`);
    // 如果设置了 DEBUG，则转换为 NODE_OPTIONS 中的 --inspect-brk
    const nodeOptions = [
      ...(process.env['DEBUG'] ? ['--inspect-brk'] : []),
      ...nodeArgs,
    ].join(' ');

    const args = [
      '-D',
      `TARGET_DIR=${fs.realpathSync(process.cwd())}`,
      '-D',
      `TMP_DIR=${fs.realpathSync(os.tmpdir())}`,
      '-D',
      `HOME_DIR=${fs.realpathSync(os.homedir())}`,
      '-D',
      `CACHE_DIR=${fs.realpathSync(execSync(`getconf DARWIN_USER_CACHE_DIR`).toString().trim())}`,
    ];

    // 添加工作区上下文中的包含目录
    // 始终添加 5 个 INCLUDE_DIR 参数以确保 .sb 文件可以引用它们
    const MAX_INCLUDE_DIRS = 5;
    const targetDir = fs.realpathSync(cliConfig?.getTargetDir() || '');
    const includedDirs: string[] = [];

    if (cliConfig) {
      const workspaceContext = cliConfig.getWorkspaceContext();
      const directories = workspaceContext.getDirectories();

      // 过滤掉 TARGET_DIR
      for (const dir of directories) {
        const realDir = fs.realpathSync(dir);
        if (realDir !== targetDir) {
          includedDirs.push(realDir);
        }
      }
    }

    for (let i = 0; i < MAX_INCLUDE_DIRS; i++) {
      let dirPath = '/dev/null'; // 默认为一个不会引起问题的安全路径

      if (i < includedDirs.length) {
        dirPath = includedDirs[i];
      }

      args.push('-D', `INCLUDE_DIR_${i}=${dirPath}`);
    }

    const finalArgv = cliArgs;

    args.push(
      '-f',
      profileFile,
      'sh',
      '-c',
      [
        `SANDBOX=sandbox-exec`,
        `NODE_OPTIONS="${nodeOptions}"`,
        ...finalArgv.map((arg) => quote([arg])),
      ].join(' '),
    );
    // 如果设置了 QWEN_SANDBOX_PROXY_COMMAND，则启动并设置代理
    const proxyCommand = process.env['QWEN_SANDBOX_PROXY_COMMAND'];
    let proxyProcess: ChildProcess | undefined = undefined;
    let sandboxProcess: ChildProcess | undefined = undefined;
    const sandboxEnv = { ...process.env };
    if (proxyCommand) {
      const proxy =
        process.env['HTTPS_PROXY'] ||
        process.env['https_proxy'] ||
        process.env['HTTP_PROXY'] ||
        process.env['http_proxy'] ||
        'http://localhost:8877';
      sandboxEnv['HTTPS_PROXY'] = proxy;
      sandboxEnv['https_proxy'] = proxy; // 小写可能也需要，例如 curl
      sandboxEnv['HTTP_PROXY'] = proxy;
      sandboxEnv['http_proxy'] = proxy;
      const noProxy = process.env['NO_PROXY'] || process.env['no_proxy'];
      if (noProxy) {
        sandboxEnv['NO_PROXY'] = noProxy;
        sandboxEnv['no_proxy'] = noProxy;
      }
      // 注意：CodeQL 标记为 js/shell-command-injection-from-environment
      // 这是故意的 - CLI 工具执行用户提供的代理命令
      proxyProcess = spawn('bash', ['-c', proxyCommand], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      });
      // 安装处理程序以在退出/信号时停止代理
      const stopProxy = () => {
        writeStderrLine('stopping proxy ...');
        if (proxyProcess?.pid) {
          process.kill(-proxyProcess.pid, 'SIGTERM');
        }
      };
      process.on('exit', stopProxy);
      process.on('SIGINT', stopProxy);
      process.on('SIGTERM', stopProxy);

      // 注释掉因为会中断 ink 渲染
      // proxyProcess.stdout?.on('data', (data) => {
      //   console.info(data.toString());
      // });
      proxyProcess.stderr?.on('data', (data) => {
        writeStderrLine(data.toString());
      });
      proxyProcess.on('close', (code, signal) => {
        if (sandboxProcess?.pid) {
          process.kill(-sandboxProcess.pid, 'SIGTERM');
        }
        throw new FatalSandboxError(
          `Proxy command '${proxyCommand}' exited with code ${code}, signal ${signal}`,
        );
      });
      writeStderrLine('waiting for proxy to start ...');
      await execAsync(
        `until timeout 0.25 curl -s http://localhost:8877; do sleep 0.25; done`,
      );
    }
    // 生成子进程并使其继承 stdio
    process.stdin.pause();
    sandboxProcess = spawn(config.command, args, {
      stdio: 'inherit',
    });
    return new Promise((resolve, reject) => {
      sandboxProcess?.on('error', reject);
      sandboxProcess?.on('close', (code) => {
        process.stdin.resume();
        resolve(code ?? 1);
      });
    });
  }

  writeStderrLine(`hopping into sandbox (command: ${config.command}) ...`);

  // 确定 qwen-code 的完整路径以区分链接和安装的设置
  const gcPath = fs.realpathSync(process.argv[1]);

  const projectSandboxDockerfile = path.join(
    SETTINGS_DIRECTORY_NAME,
    'sandbox.Dockerfile',
  );
  const isCustomProjectSandbox = fs.existsSync(projectSandboxDockerfile);

  const image = config.image;
  const workdir = path.resolve(process.cwd());
  const containerWorkdir = getContainerPath(workdir);

  // 如果设置了 BUILD_SANDBOX，则调用 qwen-code 仓库下的 scripts/build_sandbox.js
  //
  // 注意：这只能使用从 qwen-code 仓库链接的二进制文件来完成
  if (process.env['BUILD_SANDBOX']) {
    if (!gcPath.includes('qwen-code/packages/')) {
      throw new FatalSandboxError(
        'Cannot build sandbox using installed Qwen Code binary; ' +
          'run `npm link ./packages/cli` under QwenCode-cli repo to switch to linked binary.',
      );
    } else {
      writeStderrLine('building sandbox ...');
      const gcRoot = gcPath.split('/packages/')[0];
      // 如果项目文件夹在项目设置文件夹下有 sandbox.Dockerfile，使用它
      let buildArgs = '';
      const projectSandboxDockerfile = path.join(
        SETTINGS_DIRECTORY_NAME,
        'sandbox.Dockerfile',
      );
      if (isCustomProjectSandbox) {
        writeStderrLine(`using ${projectSandboxDockerfile} for sandbox`);
        buildArgs += `-f ${path.resolve(projectSandboxDockerfile)} -i ${image}`;
      }
      execSync(
        `cd ${gcRoot} && node scripts/build_sandbox.js -s ${buildArgs}`,
        {
          stdio: 'inherit',
          env: {
            ...process.env,
            QWEN_SANDBOX: config.command, // 如果通过标志启用沙箱（参见 cli 包下的 config.ts）
          },
        },
      );
    }
  }

  // 如果镜像缺失则停止
  if (!(await ensureSandboxImageIsPresent(config.command, image))) {
    const remedy =
      image === LOCAL_DEV_SANDBOX_IMAGE_NAME
        ? 'Try running `npm run build:all` or `npm run build:sandbox` under the qwen-code repo to build it locally, or check the image name and your network connection.'
        : 'Please check the image name, your network connection, or notify qwen-code-dev@service.alibaba.com if the issue persists.';
    throw new FatalSandboxError(
      `Sandbox image '${image}' is missing or could not be pulled. ${remedy}`,
    );
  }

  // 使用交互模式并在退出时自动删除容器
  // 在容器内运行 init 二进制文件以转发信号和回收僵尸进程
  const args = ['run', '-i', '--rm', '--init', '--workdir', containerWorkdir];

  // 添加 SANDBOX_FLAGS 中的自定义标志
  if (process.env['SANDBOX_FLAGS']) {
    const flags = parse(process.env['SANDBOX_FLAGS'], process.env).filter(
      (f): f is string => typeof f === 'string',
    );
    args.push(...flags);
  }

  // 仅当 stdin 也是 TTY 时才添加 TTY，即对于管道输入不要在容器内初始化 TTY
  if (process.stdin.isTTY) {
    args.push('-t');
  }

  // 允许访问 host.docker.internal
  args.push('--add-host', 'host.docker.internal:host-gateway');

  // 将当前目录挂载为沙箱中的工作目录（通过 --workdir 设置）
  args.push('--volume', `${workdir}:${containerWorkdir}`);

  // 在容器内挂载用户设置目录，创建（如果缺失）
  // 注意用户/主目录在沙箱内会发生变化，我们同时挂载两个路径以保持一致性
  const userSettingsDirOnHost = USER_SETTINGS_DIR;
  const userSettingsDirInSandbox = getContainerPath(
    `/home/node/${SETTINGS_DIRECTORY_NAME}`,
  );
  if (!fs.existsSync(userSettingsDirOnHost)) {
    fs.mkdirSync(userSettingsDirOnHost);
  }
  args.push('--volume', `${userSettingsDirOnHost}:${userSettingsDirInSandbox}`);
  if (userSettingsDirInSandbox !== userSettingsDirOnHost) {
    args.push(
      '--volume',
      `${userSettingsDirOnHost}:${getContainerPath(userSettingsDirOnHost)}`,
    );
  }

  // 将 os.tmpdir() 挂载为容器内的 os.tmpdir()
  args.push('--volume', `${os.tmpdir()}:${getContainerPath(os.tmpdir())}`);

  // 如果存在则挂载 gcloud 配置目录
  const gcloudConfigDir = path.join(os.homedir(), '.config', 'gcloud');
  if (fs.existsSync(gcloudConfigDir)) {
    args.push(
      '--volume',
      `${gcloudConfigDir}:${getContainerPath(gcloudConfigDir)}:ro`,
    );
  }

  // 如果设置了 GOOGLE_APPLICATION_CREDENTIALS 则挂载 ADC 文件
  if (process.env['GOOGLE_APPLICATION_CREDENTIALS']) {
    const adcFile = process.env['GOOGLE_APPLICATION_CREDENTIALS'];
    if (fs.existsSync(adcFile)) {
      args.push('--volume', `${adcFile}:${getContainerPath(adcFile)}:ro`);
      args.push(
        '--env',
        `GOOGLE_APPLICATION_CREDENTIALS=${getContainerPath(adcFile)}`,
      );
    }
  }

  // 挂载 SANDBOX_MOUNTS 中列出的路径
  if (process.env['SANDBOX_MOUNTS']) {
    for (let mount of process.env['SANDBOX_MOUNTS'].split(',')) {
      if (mount.trim()) {
        // 解析挂载为 from:to:opts
        let [from, to, opts] = mount.trim().split(':');
        to = to || from; // 默认为在容器内相同路径挂载
        opts = opts || 'ro'; // 默认为只读
        mount = `${from}:${to}:${opts}`;
        // 检查 from 路径是否为绝对路径
        if (!path.isAbsolute(from)) {
          throw new FatalSandboxError(
            `Path '${from}' listed in SANDBOX_MOUNTS must be absolute`,
          );
        }
        // 检查 from 路径是否在主机上存在
        if (!fs.existsSync(from)) {
          throw new FatalSandboxError(
            `Missing mount path '${from}' listed in SANDBOX_MOUNTS`,
          );
        }
        writeStderrLine(`SANDBOX_MOUNTS: ${from} -> ${to} (${opts})`);
        args.push('--volume', mount);
      }
    }
  }

  // 在沙箱上公开环境指定的端口
  ports().forEach((p) => args.push('--publish', `${p}:${p}`));

  // 如果设置了 DEBUG，则公开调试端口
  if (process.env['DEBUG']) {
    const debugPort = process.env['DEBUG_PORT'] || '9229';
    args.push(`--publish`, `${debugPort}:${debugPort}`);
  }

  // 复制代理环境变量，将 localhost 替换为 SANDBOX_PROXY_NAME
  // 复制为大写和小写，因为某些工具需要
  // QWEN_SANDBOX_PROXY_COMMAND 意味着 HTTPS_PROXY，除非设置了 HTTP_PROXY
  const proxyCommand = process.env['QWEN_SANDBOX_PROXY_COMMAND'];

  if (proxyCommand) {
    let proxy =
      process.env['HTTPS_PROXY'] ||
      process.env['https_proxy'] ||
      process.env['HTTP_PROXY'] ||
      process.env['http_proxy'] ||
      'http://localhost:8877';
    proxy = proxy.replace('localhost', SANDBOX_PROXY_NAME);
    if (proxy) {
      args.push('--env', `HTTPS_PROXY=${proxy}`);
      args.push('--env', `https_proxy=${proxy}`); // 小写可能也需要，例如 curl
      args.push('--env', `HTTP_PROXY=${proxy}`);
      args.push('--env', `http_proxy=${proxy}`);
    }
    const noProxy = process.env['NO_PROXY'] || process.env['no_proxy'];
    if (noProxy) {
      args.push('--env', `NO_PROXY=${noProxy}`);
      args.push('--env', `no_proxy=${noProxy}`);
    }

    // 如果使用代理，则通过代理切换到内部网络
    if (proxy) {
      execSync(
        `${config.command} network inspect ${SANDBOX_NETWORK_NAME} || ${config.command} network create --internal ${SANDBOX_NETWORK_NAME}`,
      );
      args.push('--network', SANDBOX_NETWORK_NAME);
      // 如果设置了代理命令，则创建一个单独的带有主机访问的网络（即非内部的）
      // 我们将在自己的容器中运行代理，连接到主机网络和内部网络
      // 这允许代理在 macOS 上使用 rootless podman 时工作，主机<->虚拟机<->容器隔离
      if (proxyCommand) {
        execSync(
          `${config.command} network inspect ${SANDBOX_PROXY_NAME} || ${config.command} network create ${SANDBOX_PROXY_NAME}`,
        );
      }
    }
  }

  // 使用镜像名称命名容器，加上随机后缀以避免冲突
  const imageName = parseImageName(image);
  const isIntegrationTest =
    process.env['QWEN_CODE_INTEGRATION_TEST'] === 'true';
  let containerName;
  if (isIntegrationTest) {
    containerName = `qwen-code-integration-test-${randomBytes(4).toString(
      'hex',
    )}`;
    writeStderrLine(`ContainerName: ${containerName}`);
  } else {
    let index = 0;
    const containerNameCheck = execSync(
      `${config.command} ps -a --format "{{.Names}}"`,
    )
      .toString()
      .trim();
    while (containerNameCheck.includes(`${imageName}-${index}`)) {
      index++;
    }
    containerName = `${imageName}-${index}`;
    writeStderrLine(`ContainerName (regular): ${containerName}`);
  }
  args.push('--name', containerName, '--hostname', containerName);

  // 复制 QWEN_CODE_TEST_VAR 用于集成测试
  if (process.env['QWEN_CODE_TEST_VAR']) {
    args.push(
      '--env',
      `QWEN_CODE_TEST_VAR=${process.env['QWEN_CODE_TEST_VAR']}`,
    );
  }

  // 复制 GEMINI_API_KEY(s)
  if (process.env['GEMINI_API_KEY']) {
    args.push('--env', `GEMINI_API_KEY=${process.env['GEMINI_API_KEY']}`);
  }
  if (process.env['GOOGLE_API_KEY']) {
    args.push('--env', `GOOGLE_API_KEY=${process.env['GOOGLE_API_KEY']}`);
  }

  // 复制 OPENAI_API_KEY 和相关的 Qwen 环境变量
  if (process.env['OPENAI_API_KEY']) {
    args.push('--env', `OPENAI_API_KEY=${process.env['OPENAI_API_KEY']}`);
  }
  // 复制 TAVILY_API_KEY 用于网络搜索工具
  if (process.env['TAVILY_API_KEY']) {
    args.push('--env', `TAVILY_API_KEY=${process.env['TAVILY_API_KEY']}`);
  }
  if (process.env['OPENAI_BASE_URL']) {
    args.push('--env', `OPENAI_BASE_URL=${process.env['OPENAI_BASE_URL']}`);
  }
  if (process.env['OPENAI_MODEL']) {
    args.push('--env', `OPENAI_MODEL=${process.env['OPENAI_MODEL']}`);
  }

  // 复制 GOOGLE_GENAI_USE_VERTEXAI
  if (process.env['GOOGLE_GENAI_USE_VERTEXAI']) {
    args.push(
      '--env',
      `GOOGLE_GENAI_USE_VERTEXAI=${process.env['GOOGLE_GENAI_USE_VERTEXAI']}`,
    );
  }

  // 复制 GOOGLE_GENAI_USE_GCA
  if (process.env['GOOGLE_GENAI_USE_GCA']) {
    args.push(
      '--env',
      `GOOGLE_GENAI_USE_GCA=${process.env['GOOGLE_GENAI_USE_GCA']}`,
    );
  }

  // 复制 GOOGLE_CLOUD_PROJECT
  if (process.env['GOOGLE_CLOUD_PROJECT']) {
    args.push(
      '--env',
      `GOOGLE_CLOUD_PROJECT=${process.env['GOOGLE_CLOUD_PROJECT']}`,
    );
  }

  // 复制 GOOGLE_CLOUD_LOCATION
  if (process.env['GOOGLE_CLOUD_LOCATION']) {
    args.push(
      '--env',
      `GOOGLE_CLOUD_LOCATION=${process.env['GOOGLE_CLOUD_LOCATION']}`,
    );
  }

  // 复制 GEMINI_MODEL
  if (process.env['GEMINI_MODEL']) {
    args.push('--env', `GEMINI_MODEL=${process.env['GEMINI_MODEL']}`);
  }

  // 复制 TERM 和 COLORTERM 以尝试保持终端设置
  if (process.env['TERM']) {
    args.push('--env', `TERM=${process.env['TERM']}`);
  }
  if (process.env['COLORTERM']) {
    args.push('--env', `COLORTERM=${process.env['COLORTERM']}`);
  }

  // 传递 IDE 模式环境变量
  for (const envVar of [
    'QWEN_CODE_IDE_SERVER_PORT',
    'QWEN_CODE_IDE_WORKSPACE_PATH',
    'TERM_PROGRAM',
  ]) {
    if (process.env[envVar]) {
      args.push('--env', `${envVar}=${process.env[envVar]}`);
    }
  }

  // 复制 VIRTUAL_ENV（如果在工作目录下）
  // 还挂载替换 VIRTUAL_ENV 目录为 <project_settings>/sandbox.venv
  // 沙箱然后可以使用 sandbox.bashrc 设置这个新的 VIRTUAL_ENV 目录（见下文）
  // 如果未设置，目录将为空，这仍然比有主机二进制文件更好
  if (
    process.env['VIRTUAL_ENV']?.toLowerCase().startsWith(workdir.toLowerCase())
  ) {
    const sandboxVenvPath = path.resolve(
      SETTINGS_DIRECTORY_NAME,
      'sandbox.venv',
    );
    if (!fs.existsSync(sandboxVenvPath)) {
      fs.mkdirSync(sandboxVenvPath, { recursive: true });
    }
    args.push(
      '--volume',
      `${sandboxVenvPath}:${getContainerPath(process.env['VIRTUAL_ENV'])}`,
    );
    args.push(
      '--env',
      `VIRTUAL_ENV=${getContainerPath(process.env['VIRTUAL_ENV'])}`,
    );
  }

  // 从 SANDBOX_ENV 复制额外的环境变量
  if (process.env['SANDBOX_ENV']) {
    for (let env of process.env['SANDBOX_ENV'].split(',')) {
      if ((env = env.trim())) {
        if (env.includes('=')) {
          writeStderrLine(`SANDBOX_ENV: ${env}`);
          args.push('--env', env);
        } else {
          throw new FatalSandboxError(
            'SANDBOX_ENV must be a comma-separated list of key=value pairs',
          );
        }
      }
    }
  }

  // 复制 NODE_OPTIONS
  const existingNodeOptions = process.env['NODE_OPTIONS'] || '';
  const allNodeOptions = [
    ...(existingNodeOptions ? [existingNodeOptions] : []),
    ...nodeArgs,
  ].join(' ');

  if (allNodeOptions.length > 0) {
    args.push('--env', `NODE_OPTIONS="${allNodeOptions}"`);
  }

  // 将 SANDBOX 设置为容器名称
  args.push('--env', `SANDBOX=${containerName}`);

  // 仅对于 podman，使用空的 --authfile 以避免不必要的认证刷新开销
  if (config.command === 'podman') {
    const emptyAuthFilePath = path.join(os.tmpdir(), 'empty_auth.json');
    fs.writeFileSync(emptyAuthFilePath, '{}', 'utf-8');
    args.push('--authfile', emptyAuthFilePath);
  }

  // 确定是否应将当前用户的 UID/GID 传递给沙箱
  // 详见 shouldUseCurrentUserInSandbox
  let userFlag = '';
  const finalEntrypoint = entrypoint(workdir, cliArgs);

  // 检查是否应在沙箱中使用当前用户的 UID/GID
  // 在集成测试模式下，我们仍然尊重 SANDBOX_SET_UID_GID 以允许
  // 需要访问主机 ~/.qwen 的测试（例如 --resume 功能）工作
  const useCurrentUser = await shouldUseCurrentUserInSandbox();

  if (useCurrentUser) {
    // SANDBOX_SET_UID_GID 已启用：使用主机的 UID/GID 创建用户
    // 这包括带有 SANDBOX_SET_UID_GID=true 的集成测试模式，
    // 允许需要访问主机 ~/.qwen 的测试（例如 --resume）工作
    // 为了使用户创建逻辑工作，容器必须以 root 启动
    // 入口点脚本然后处理降级到正确的用户
    args.push('--user', 'root');

    const uid = execSync('id -u').toString().trim();
    const gid = execSync('id -g').toString().trim();

    // 不将 --user 传递给主沙箱容器，而是让它以 root 启动，
    // 然后创建具有主机 UID/GID 的用户，
    // 最后切换到该用户运行 qwen 进程。这在 Linux 上是必要的
    // 以确保用户存在于容器的 /etc/passwd 文件中，这是 os.userInfo() 所必需的
    const username = 'qwen';
    const homeDir = getContainerPath(os.homedir());

    const setupUserCommands = [
      // 使用 -f 和 groupadd 以避免组已存在的错误
      `groupadd -f -g ${gid} ${username}`,
      // 仅在用户不存在时创建。使用 -o 获取非唯一 UID
      `id -u ${username} &>/dev/null || useradd -o -u ${uid} -g ${gid} -d ${homeDir} -s /bin/bash ${username}`,
    ].join(' && ');

    const originalCommand = finalEntrypoint[2];
    const escapedOriginalCommand = originalCommand.replace(/'/g, "'\\''");

    // 使用 `su -p` 保留环境
    const suCommand = `su -p ${username} -c '${escapedOriginalCommand}'`;

    // 入口点始终是 `['bash', '-c', '<command>']`，因此我们修改命令部分
    finalEntrypoint[2] = `${setupUserCommands} && ${suCommand}`;

    // 对于更简单的代理容器，我们仍然需要 userFlag，因为它没有这个问题
    userFlag = `--user ${uid}:${gid}`;
    // 当在沙箱中强制使用 UID 时，$HOME 可能重置为 '/'，因此我们也将 $HOME 复制过来
    args.push('--env', `HOME=${os.homedir()}`);
  } else if (isIntegrationTest) {
    // 禁用 UID/GID 匹配的集成测试模式：使用 root
    args.push('--user', 'root');
    userFlag = '--user root';
  }
  // else: 禁用 UID/GID 匹配的非 IT 模式 - 使用镜像默认用户（node）

  // 推送容器镜像名称
  args.push(image);

  // 推送容器入口点（包括参数）
  args.push(...finalEntrypoint);

  // 如果设置了 QWEN_SANDBOX_PROXY_COMMAND，则启动并设置代理
  let proxyProcess: ChildProcess | undefined = undefined;
  let sandboxProcess: ChildProcess | undefined = undefined;

  if (proxyCommand) {
    // 在自己的容器中运行 proxyCommand
    const proxyContainerCommand = `${config.command} run --rm --init ${userFlag} --name ${SANDBOX_PROXY_NAME} --network ${SANDBOX_PROXY_NAME} -p 8877:8877 -v ${process.cwd()}:${workdir} --workdir ${workdir} ${image} ${proxyCommand}`;
    const isWindows = os.platform() === 'win32';
    const proxyShell = isWindows ? 'cmd.exe' : 'bash';
    const proxyShellArgs = isWindows
      ? ['/c', proxyContainerCommand]
      : ['-c', proxyContainerCommand];
    // 注意：CodeQL 标记为 js/shell-command-injection-from-environment
    // 这是故意的 - CLI 工具在容器中执行用户提供的代理命令
    proxyProcess = spawn(proxyShell, proxyShellArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    // 安装处理程序以在退出/信号时停止代理
    const stopProxy = () => {
      writeStderrLine('stopping proxy container ...');
      execSync(`${config.command} rm -f ${SANDBOX_PROXY_NAME}`);
    };
    process.on('exit', stopProxy);
    process.on('SIGINT', stopProxy);
    process.on('SIGTERM', stopProxy);

    // 注释掉因为会中断 ink 渲染
    // proxyProcess.stdout?.on('data', (data) => {
    //   console.info(data.toString());
    // });
    proxyProcess.stderr?.on('data', (data) => {
      writeStderrLine(data.toString().trim());
    });
    proxyProcess.on('close', (code, signal) => {
      if (sandboxProcess?.pid) {
        process.kill(-sandboxProcess.pid, 'SIGTERM');
      }
      throw new FatalSandboxError(
        `Proxy container command '${proxyContainerCommand}' exited with code ${code}, signal ${signal}`,
      );
    });
    writeStderrLine('waiting for proxy to start ...');
    await execAsync(
      `until timeout 0.25 curl -s http://localhost:8877; do sleep 0.25; done`,
    );
    // 将代理容器连接到沙箱网络
    //（对于不支持多个 --network 参数的旧版本 docker 的变通方法）
    await execAsync(
      `${config.command} network connect ${SANDBOX_NETWORK_NAME} ${SANDBOX_PROXY_NAME}`,
    );
  }

  // 生成子进程并使其继承 stdio
  process.stdin.pause();
  sandboxProcess = spawn(config.command, args, {
    stdio: 'inherit',
  });

  return new Promise<number>((resolve, reject) => {
    sandboxProcess.on('error', (err) => {
      writeStderrLine(`Sandbox process error: ${err}`);
      reject(err);
    });

    sandboxProcess?.on('close', (code, signal) => {
      process.stdin.resume();
      if (code !== 0 && code !== null) {
        writeStderrLine(
          `Sandbox process exited with code: ${code}, signal: ${signal}`,
        );
      }
      resolve(code ?? 1);
    });
  });
}

// 确保沙箱镜像存在的辅助函数
/**
 * 检查镜像是否存在于本地
 * @param sandbox - 沙箱命令（docker 或 podman）
 * @param image - 镜像名称
 * @returns Promise<boolean> 如果镜像存在则返回 true
 */
async function imageExists(sandbox: string, image: string): Promise<boolean> {
  return new Promise((resolve) => {
    const args = ['images', '-q', image];
    const checkProcess = spawn(sandbox, args);

    let stdoutData = '';
    if (checkProcess.stdout) {
      checkProcess.stdout.on('data', (data) => {
        stdoutData += data.toString();
      });
    }

    checkProcess.on('error', (err) => {
      writeStderrLine(
        `Failed to start '${sandbox}' command for image check: ${err.message}`,
      );
      resolve(false);
    });

    checkProcess.on('close', (code) => {
      // 非零代码可能表示 docker 守护进程未运行等
      // 主要成功指标是非空的 stdoutData
      if (code !== 0) {
        // console.warn(`'${sandbox} images -q ${image}' exited with code ${code}.`);
      }
      resolve(stdoutData.trim() !== '');
    });
  });
}

/**
 * 拉取沙箱镜像
 * @param sandbox - 沙箱命令（docker 或 podman）
 * @param image - 镜像名称
 * @returns Promise<boolean> 如果拉取成功则返回 true
 */
async function pullImage(sandbox: string, image: string): Promise<boolean> {
  writeStderrLine(`Attempting to pull image ${image} using ${sandbox}...`);
  return new Promise((resolve) => {
    const args = ['pull', image];
    const pullProcess = spawn(sandbox, args, { stdio: 'pipe' });

    let stderrData = '';

    const onStdoutData = (data: Buffer) => {
      writeStderrLine(data.toString().trim()); // 显示拉取进度
    };

    const onStderrData = (data: Buffer) => {
      stderrData += data.toString();
      writeStderrLine(data.toString().trim()); // 显示命令本身的拉取错误/信息
    };

    const onError = (err: Error) => {
      writeStderrLine(
        `Failed to start '${sandbox} pull ${image}' command: ${err.message}`,
      );
      cleanup();
      resolve(false);
    };

    const onClose = (code: number | null) => {
      if (code === 0) {
        writeStderrLine(`Successfully pulled image ${image}.`);
        cleanup();
        resolve(true);
      } else {
        writeStderrLine(
          `Failed to pull image ${image}. '${sandbox} pull ${image}' exited with code ${code}.`,
        );
        if (stderrData.trim()) {
          // 详细信息已由上面的 stderr 监听器打印
        }
        cleanup();
        resolve(false);
      }
    };

    const cleanup = () => {
      if (pullProcess.stdout) {
        pullProcess.stdout.removeListener('data', onStdoutData);
      }
      if (pullProcess.stderr) {
        pullProcess.stderr.removeListener('data', onStderrData);
      }
      pullProcess.removeListener('error', onError);
      pullProcess.removeListener('close', onClose);
      if (pullProcess.connected) {
        pullProcess.disconnect();
      }
    };

    if (pullProcess.stdout) {
      pullProcess.stdout.on('data', onStdoutData);
    }
    if (pullProcess.stderr) {
      pullProcess.stderr.on('data', onStderrData);
    }
    pullProcess.on('error', onError);
    pullProcess.on('close', onClose);
  });
}

/**
 * 确保沙箱镜像存在
 * 如果本地不存在则尝试拉取
 * @param sandbox - 沙箱命令（docker 或 podman）
 * @param image - 镜像名称
 * @returns Promise<boolean> 如果镜像可用则返回 true
 */
async function ensureSandboxImageIsPresent(
  sandbox: string,
  image: string,
): Promise<boolean> {
  writeStderrLine(`Checking for sandbox image: ${image}`);
  if (await imageExists(sandbox, image)) {
    writeStderrLine(`Sandbox image ${image} found locally.`);
    return true;
  }

  writeStderrLine(`Sandbox image ${image} not found locally.`);
  if (image === LOCAL_DEV_SANDBOX_IMAGE_NAME) {
    // 用户需要自己构建镜像
    return false;
  }

  if (await pullImage(sandbox, image)) {
    // 尝试拉取后，再次检查以确认
    if (await imageExists(sandbox, image)) {
      writeStderrLine(`Sandbox image ${image} is now available after pulling.`);
      return true;
    } else {
      writeStderrLine(
        `Sandbox image ${image} still not found after a pull attempt. This might indicate an issue with the image name or registry, or the pull command reported success but failed to make the image available.`,
      );
      return false;
    }
  }

  writeStderrLine(
    `Failed to obtain sandbox image ${image} after check and pull attempt.`,
  );
  return false; // 拉取命令失败或镜像仍然不存在
}

  const withForwardSlashes = hostPath.replace(/\\/g, '/');
  const match = withForwardSlashes.match(/^([A-Z]):\/(.*)/i);
  if (match) {
    return `/${match[1].toLowerCase()}/${match[2]}`;
  }
  return hostPath;
}

const LOCAL_DEV_SANDBOX_IMAGE_NAME = 'qwen-code-sandbox';
const SANDBOX_NETWORK_NAME = 'qwen-code-sandbox';
const SANDBOX_PROXY_NAME = 'qwen-code-sandbox-proxy';
const BUILTIN_SEATBELT_PROFILES = [
  'permissive-open',
  'permissive-closed',
  'permissive-proxied',
  'restrictive-open',
  'restrictive-closed',
  'restrictive-proxied',
];

/**
 * Determines whether the sandbox container should be run with the current user's UID and GID.
 * This is often necessary on Linux systems when using rootful Docker without userns-remap
 * configured, to avoid permission issues with
 * mounted volumes.
 *
 * The behavior is controlled by the `SANDBOX_SET_UID_GID` environment variable:
 * - If `SANDBOX_SET_UID_GID` is "1" or "true", this function returns `true`.
 * - If `SANDBOX_SET_UID_GID` is "0" or "false", this function returns `false`.
 * - If `SANDBOX_SET_UID_GID` is not set:
 *   - On Linux, it defaults to `true`.
 *   - On other OSes, it defaults to `false`.
 *
 * For more context on running Docker containers as non-root, see:
 * https://medium.com/redbubble/running-a-docker-container-as-a-non-root-user-7d2e00f8ee15
 *
 * @returns {Promise<boolean>} A promise that resolves to true if the current user's UID/GID should be used, false otherwise.
 */
async function shouldUseCurrentUserInSandbox(): Promise<boolean> {
  const envVar = process.env['SANDBOX_SET_UID_GID']?.toLowerCase().trim();

  if (envVar === '1' || envVar === 'true') {
    return true;
  }
  if (envVar === '0' || envVar === 'false') {
    return false;
  }

  if (os.platform() === 'linux') {
    const debugEnv = [process.env['DEBUG'], process.env['DEBUG_MODE']].some(
      (v) => v === 'true' || v === '1',
    );
    if (debugEnv) {
      // Use stderr so it doesn't clutter normal STDOUT output (e.g. in `--prompt` runs).
      writeStderrLine(
        'INFO: Using current user UID/GID in Linux sandbox. Set SANDBOX_SET_UID_GID=false to disable.',
      );
    }
    return true;
  }

  return false;
}

// docker does not allow container names to contain ':' or '/', so we
// parse those out to shorten the name
function parseImageName(image: string): string {
  const [fullName, tag] = image.split(':');
  const name = fullName.split('/').at(-1) ?? 'unknown-image';
  return tag ? `${name}-${tag}` : name;
}

function ports(): string[] {
  return (process.env['SANDBOX_PORTS'] ?? '')
    .split(',')
    .filter((p) => p.trim())
    .map((p) => p.trim());
}

function entrypoint(workdir: string, cliArgs: string[]): string[] {
  const isWindows = os.platform() === 'win32';
  const containerWorkdir = getContainerPath(workdir);
  const shellCmds = [];
  const pathSeparator = isWindows ? ';' : ':';

  let pathSuffix = '';
  if (process.env['PATH']) {
    const paths = process.env['PATH'].split(pathSeparator);
    for (const p of paths) {
      const containerPath = getContainerPath(p);
      if (
        containerPath.toLowerCase().startsWith(containerWorkdir.toLowerCase())
      ) {
        pathSuffix += `:${containerPath}`;
      }
    }
  }
  if (pathSuffix) {
    shellCmds.push(`export PATH="$PATH${pathSuffix}";`);
  }

  let pythonPathSuffix = '';
  if (process.env['PYTHONPATH']) {
    const paths = process.env['PYTHONPATH'].split(pathSeparator);
    for (const p of paths) {
      const containerPath = getContainerPath(p);
      if (
        containerPath.toLowerCase().startsWith(containerWorkdir.toLowerCase())
      ) {
        pythonPathSuffix += `:${containerPath}`;
      }
    }
  }
  if (pythonPathSuffix) {
    shellCmds.push(`export PYTHONPATH="$PYTHONPATH${pythonPathSuffix}";`);
  }

  const projectSandboxBashrc = path.join(
    SETTINGS_DIRECTORY_NAME,
    'sandbox.bashrc',
  );
  if (fs.existsSync(projectSandboxBashrc)) {
    shellCmds.push(`source ${getContainerPath(projectSandboxBashrc)};`);
  }

  ports().forEach((p) =>
    shellCmds.push(
      `socat TCP4-LISTEN:${p},bind=$(hostname -i),fork,reuseaddr TCP4:127.0.0.1:${p} 2> /dev/null &`,
    ),
  );

  const quotedCliArgs = cliArgs.slice(2).map((arg) => quote([arg]));
  const cliCmd =
    process.env['NODE_ENV'] === 'development'
      ? process.env['DEBUG']
        ? 'npm run debug --'
        : 'npm rebuild && npm run start --'
      : process.env['DEBUG']
        ? `node --inspect-brk=0.0.0.0:${process.env['DEBUG_PORT'] || '9229'} $(which qwen)`
        : 'qwen';

  const args = [...shellCmds, cliCmd, ...quotedCliArgs];
  return ['bash', '-c', args.join(' ')];
}

export async function start_sandbox(
  config: SandboxConfig,
  nodeArgs: string[] = [],
  cliConfig?: Config,
  cliArgs: string[] = [],
): Promise<number> {
  if (config.command === 'sandbox-exec') {
    // disallow BUILD_SANDBOX
    if (process.env['BUILD_SANDBOX']) {
      throw new FatalSandboxError(
        'Cannot BUILD_SANDBOX when using macOS Seatbelt',
      );
    }

    const profile = (process.env['SEATBELT_PROFILE'] ??= 'permissive-open');
    let profileFile = fileURLToPath(
      new URL(`sandbox-macos-${profile}.sb`, import.meta.url),
    );
    // if profile name is not recognized, then look for file under project settings directory
    if (!BUILTIN_SEATBELT_PROFILES.includes(profile)) {
      profileFile = path.join(
        SETTINGS_DIRECTORY_NAME,
        `sandbox-macos-${profile}.sb`,
      );
    }
    if (!fs.existsSync(profileFile)) {
      throw new FatalSandboxError(
        `Missing macos seatbelt profile file '${profileFile}'`,
      );
    }
    // Log on STDERR so it doesn't clutter the output on STDOUT
    writeStderrLine(`using macos seatbelt (profile: ${profile}) ...`);
    // if DEBUG is set, convert to --inspect-brk in NODE_OPTIONS
    const nodeOptions = [
      ...(process.env['DEBUG'] ? ['--inspect-brk'] : []),
      ...nodeArgs,
    ].join(' ');

    const args = [
      '-D',
      `TARGET_DIR=${fs.realpathSync(process.cwd())}`,
      '-D',
      `TMP_DIR=${fs.realpathSync(os.tmpdir())}`,
      '-D',
      `HOME_DIR=${fs.realpathSync(os.homedir())}`,
      '-D',
      `CACHE_DIR=${fs.realpathSync(execSync(`getconf DARWIN_USER_CACHE_DIR`).toString().trim())}`,
    ];

    // Add included directories from the workspace context
    // Always add 5 INCLUDE_DIR parameters to ensure .sb files can reference them
    const MAX_INCLUDE_DIRS = 5;
    const targetDir = fs.realpathSync(cliConfig?.getTargetDir() || '');
    const includedDirs: string[] = [];

    if (cliConfig) {
      const workspaceContext = cliConfig.getWorkspaceContext();
      const directories = workspaceContext.getDirectories();

      // Filter out TARGET_DIR
      for (const dir of directories) {
        const realDir = fs.realpathSync(dir);
        if (realDir !== targetDir) {
          includedDirs.push(realDir);
        }
      }
    }

    for (let i = 0; i < MAX_INCLUDE_DIRS; i++) {
      let dirPath = '/dev/null'; // Default to a safe path that won't cause issues

      if (i < includedDirs.length) {
        dirPath = includedDirs[i];
      }

      args.push('-D', `INCLUDE_DIR_${i}=${dirPath}`);
    }

    const finalArgv = cliArgs;

    args.push(
      '-f',
      profileFile,
      'sh',
      '-c',
      [
        `SANDBOX=sandbox-exec`,
        `NODE_OPTIONS="${nodeOptions}"`,
        ...finalArgv.map((arg) => quote([arg])),
      ].join(' '),
    );
    // start and set up proxy if QWEN_SANDBOX_PROXY_COMMAND is set
    const proxyCommand = process.env['QWEN_SANDBOX_PROXY_COMMAND'];
    let proxyProcess: ChildProcess | undefined = undefined;
    let sandboxProcess: ChildProcess | undefined = undefined;
    const sandboxEnv = { ...process.env };
    if (proxyCommand) {
      const proxy =
        process.env['HTTPS_PROXY'] ||
        process.env['https_proxy'] ||
        process.env['HTTP_PROXY'] ||
        process.env['http_proxy'] ||
        'http://localhost:8877';
      sandboxEnv['HTTPS_PROXY'] = proxy;
      sandboxEnv['https_proxy'] = proxy; // lower-case can be required, e.g. for curl
      sandboxEnv['HTTP_PROXY'] = proxy;
      sandboxEnv['http_proxy'] = proxy;
      const noProxy = process.env['NO_PROXY'] || process.env['no_proxy'];
      if (noProxy) {
        sandboxEnv['NO_PROXY'] = noProxy;
        sandboxEnv['no_proxy'] = noProxy;
      }
      // Note: CodeQL flags this as js/shell-command-injection-from-environment.
      // This is intentional - CLI tool executes user-provided proxy commands.
      proxyProcess = spawn('bash', ['-c', proxyCommand], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      });
      // install handlers to stop proxy on exit/signal
      const stopProxy = () => {
        writeStderrLine('stopping proxy ...');
        if (proxyProcess?.pid) {
          process.kill(-proxyProcess.pid, 'SIGTERM');
        }
      };
      process.on('exit', stopProxy);
      process.on('SIGINT', stopProxy);
      process.on('SIGTERM', stopProxy);

      // commented out as it disrupts ink rendering
      // proxyProcess.stdout?.on('data', (data) => {
      //   console.info(data.toString());
      // });
      proxyProcess.stderr?.on('data', (data) => {
        writeStderrLine(data.toString());
      });
      proxyProcess.on('close', (code, signal) => {
        if (sandboxProcess?.pid) {
          process.kill(-sandboxProcess.pid, 'SIGTERM');
        }
        throw new FatalSandboxError(
          `Proxy command '${proxyCommand}' exited with code ${code}, signal ${signal}`,
        );
      });
      writeStderrLine('waiting for proxy to start ...');
      await execAsync(
        `until timeout 0.25 curl -s http://localhost:8877; do sleep 0.25; done`,
      );
    }
    // spawn child and let it inherit stdio
    process.stdin.pause();
    sandboxProcess = spawn(config.command, args, {
      stdio: 'inherit',
    });
    return new Promise((resolve, reject) => {
      sandboxProcess?.on('error', reject);
      sandboxProcess?.on('close', (code) => {
        process.stdin.resume();
        resolve(code ?? 1);
      });
    });
  }

  writeStderrLine(`hopping into sandbox (command: ${config.command}) ...`);

  // determine full path for qwen-code to distinguish linked vs installed setting
  const gcPath = fs.realpathSync(process.argv[1]);

  const projectSandboxDockerfile = path.join(
    SETTINGS_DIRECTORY_NAME,
    'sandbox.Dockerfile',
  );
  const isCustomProjectSandbox = fs.existsSync(projectSandboxDockerfile);

  const image = config.image;
  const workdir = path.resolve(process.cwd());
  const containerWorkdir = getContainerPath(workdir);

  // if BUILD_SANDBOX is set, then call scripts/build_sandbox.js under qwen-code repo
  //
  // note this can only be done with binary linked from qwen-code repo
  if (process.env['BUILD_SANDBOX']) {
    if (!gcPath.includes('qwen-code/packages/')) {
      throw new FatalSandboxError(
        'Cannot build sandbox using installed Qwen Code binary; ' +
          'run `npm link ./packages/cli` under QwenCode-cli repo to switch to linked binary.',
      );
    } else {
      writeStderrLine('building sandbox ...');
      const gcRoot = gcPath.split('/packages/')[0];
      // if project folder has sandbox.Dockerfile under project settings folder, use that
      let buildArgs = '';
      const projectSandboxDockerfile = path.join(
        SETTINGS_DIRECTORY_NAME,
        'sandbox.Dockerfile',
      );
      if (isCustomProjectSandbox) {
        writeStderrLine(`using ${projectSandboxDockerfile} for sandbox`);
        buildArgs += `-f ${path.resolve(projectSandboxDockerfile)} -i ${image}`;
      }
      execSync(
        `cd ${gcRoot} && node scripts/build_sandbox.js -s ${buildArgs}`,
        {
          stdio: 'inherit',
          env: {
            ...process.env,
            QWEN_SANDBOX: config.command, // in case sandbox is enabled via flags (see config.ts under cli package)
          },
        },
      );
    }
  }

  // stop if image is missing
  if (!(await ensureSandboxImageIsPresent(config.command, image))) {
    const remedy =
      image === LOCAL_DEV_SANDBOX_IMAGE_NAME
        ? 'Try running `npm run build:all` or `npm run build:sandbox` under the qwen-code repo to build it locally, or check the image name and your network connection.'
        : 'Please check the image name, your network connection, or notify qwen-code-dev@service.alibaba.com if the issue persists.';
    throw new FatalSandboxError(
      `Sandbox image '${image}' is missing or could not be pulled. ${remedy}`,
    );
  }

  // use interactive mode and auto-remove container on exit
  // run init binary inside container to forward signals & reap zombies
  const args = ['run', '-i', '--rm', '--init', '--workdir', containerWorkdir];

  // add custom flags from SANDBOX_FLAGS
  if (process.env['SANDBOX_FLAGS']) {
    const flags = parse(process.env['SANDBOX_FLAGS'], process.env).filter(
      (f): f is string => typeof f === 'string',
    );
    args.push(...flags);
  }

  // add TTY only if stdin is TTY as well, i.e. for piped input don't init TTY in container
  if (process.stdin.isTTY) {
    args.push('-t');
  }

  // allow access to host.docker.internal
  args.push('--add-host', 'host.docker.internal:host-gateway');

  // mount current directory as working directory in sandbox (set via --workdir)
  args.push('--volume', `${workdir}:${containerWorkdir}`);

  // mount user settings directory inside container, after creating if missing
  // note user/home changes inside sandbox and we mount at BOTH paths for consistency
  const userSettingsDirOnHost = USER_SETTINGS_DIR;
  const userSettingsDirInSandbox = getContainerPath(
    `/home/node/${SETTINGS_DIRECTORY_NAME}`,
  );
  if (!fs.existsSync(userSettingsDirOnHost)) {
    fs.mkdirSync(userSettingsDirOnHost);
  }
  args.push('--volume', `${userSettingsDirOnHost}:${userSettingsDirInSandbox}`);
  if (userSettingsDirInSandbox !== userSettingsDirOnHost) {
    args.push(
      '--volume',
      `${userSettingsDirOnHost}:${getContainerPath(userSettingsDirOnHost)}`,
    );
  }

  // mount os.tmpdir() as os.tmpdir() inside container
  args.push('--volume', `${os.tmpdir()}:${getContainerPath(os.tmpdir())}`);

  // mount gcloud config directory if it exists
  const gcloudConfigDir = path.join(os.homedir(), '.config', 'gcloud');
  if (fs.existsSync(gcloudConfigDir)) {
    args.push(
      '--volume',
      `${gcloudConfigDir}:${getContainerPath(gcloudConfigDir)}:ro`,
    );
  }

  // mount ADC file if GOOGLE_APPLICATION_CREDENTIALS is set
  if (process.env['GOOGLE_APPLICATION_CREDENTIALS']) {
    const adcFile = process.env['GOOGLE_APPLICATION_CREDENTIALS'];
    if (fs.existsSync(adcFile)) {
      args.push('--volume', `${adcFile}:${getContainerPath(adcFile)}:ro`);
      args.push(
        '--env',
        `GOOGLE_APPLICATION_CREDENTIALS=${getContainerPath(adcFile)}`,
      );
    }
  }

  // mount paths listed in SANDBOX_MOUNTS
  if (process.env['SANDBOX_MOUNTS']) {
    for (let mount of process.env['SANDBOX_MOUNTS'].split(',')) {
      if (mount.trim()) {
        // parse mount as from:to:opts
        let [from, to, opts] = mount.trim().split(':');
        to = to || from; // default to mount at same path inside container
        opts = opts || 'ro'; // default to read-only
        mount = `${from}:${to}:${opts}`;
        // check that from path is absolute
        if (!path.isAbsolute(from)) {
          throw new FatalSandboxError(
            `Path '${from}' listed in SANDBOX_MOUNTS must be absolute`,
          );
        }
        // check that from path exists on host
        if (!fs.existsSync(from)) {
          throw new FatalSandboxError(
            `Missing mount path '${from}' listed in SANDBOX_MOUNTS`,
          );
        }
        writeStderrLine(`SANDBOX_MOUNTS: ${from} -> ${to} (${opts})`);
        args.push('--volume', mount);
      }
    }
  }

  // expose env-specified ports on the sandbox
  ports().forEach((p) => args.push('--publish', `${p}:${p}`));

  // if DEBUG is set, expose debugging port
  if (process.env['DEBUG']) {
    const debugPort = process.env['DEBUG_PORT'] || '9229';
    args.push(`--publish`, `${debugPort}:${debugPort}`);
  }

  // copy proxy environment variables, replacing localhost with SANDBOX_PROXY_NAME
  // copy as both upper-case and lower-case as is required by some utilities
  // QWEN_SANDBOX_PROXY_COMMAND implies HTTPS_PROXY unless HTTP_PROXY is set
  const proxyCommand = process.env['QWEN_SANDBOX_PROXY_COMMAND'];

  if (proxyCommand) {
    let proxy =
      process.env['HTTPS_PROXY'] ||
      process.env['https_proxy'] ||
      process.env['HTTP_PROXY'] ||
      process.env['http_proxy'] ||
      'http://localhost:8877';
    proxy = proxy.replace('localhost', SANDBOX_PROXY_NAME);
    if (proxy) {
      args.push('--env', `HTTPS_PROXY=${proxy}`);
      args.push('--env', `https_proxy=${proxy}`); // lower-case can be required, e.g. for curl
      args.push('--env', `HTTP_PROXY=${proxy}`);
      args.push('--env', `http_proxy=${proxy}`);
    }
    const noProxy = process.env['NO_PROXY'] || process.env['no_proxy'];
    if (noProxy) {
      args.push('--env', `NO_PROXY=${noProxy}`);
      args.push('--env', `no_proxy=${noProxy}`);
    }

    // if using proxy, switch to internal networking through proxy
    if (proxy) {
      execSync(
        `${config.command} network inspect ${SANDBOX_NETWORK_NAME} || ${config.command} network create --internal ${SANDBOX_NETWORK_NAME}`,
      );
      args.push('--network', SANDBOX_NETWORK_NAME);
      // if proxy command is set, create a separate network w/ host access (i.e. non-internal)
      // we will run proxy in its own container connected to both host network and internal network
      // this allows proxy to work even on rootless podman on macos with host<->vm<->container isolation
      if (proxyCommand) {
        execSync(
          `${config.command} network inspect ${SANDBOX_PROXY_NAME} || ${config.command} network create ${SANDBOX_PROXY_NAME}`,
        );
      }
    }
  }

  // name container after image, plus random suffix to avoid conflicts
  const imageName = parseImageName(image);
  const isIntegrationTest =
    process.env['QWEN_CODE_INTEGRATION_TEST'] === 'true';
  let containerName;
  if (isIntegrationTest) {
    containerName = `qwen-code-integration-test-${randomBytes(4).toString(
      'hex',
    )}`;
    writeStderrLine(`ContainerName: ${containerName}`);
  } else {
    let index = 0;
    const containerNameCheck = execSync(
      `${config.command} ps -a --format "{{.Names}}"`,
    )
      .toString()
      .trim();
    while (containerNameCheck.includes(`${imageName}-${index}`)) {
      index++;
    }
    containerName = `${imageName}-${index}`;
    writeStderrLine(`ContainerName (regular): ${containerName}`);
  }
  args.push('--name', containerName, '--hostname', containerName);

  // copy QWEN_CODE_TEST_VAR for integration tests
  if (process.env['QWEN_CODE_TEST_VAR']) {
    args.push(
      '--env',
      `QWEN_CODE_TEST_VAR=${process.env['QWEN_CODE_TEST_VAR']}`,
    );
  }

  // copy GEMINI_API_KEY(s)
  if (process.env['GEMINI_API_KEY']) {
    args.push('--env', `GEMINI_API_KEY=${process.env['GEMINI_API_KEY']}`);
  }
  if (process.env['GOOGLE_API_KEY']) {
    args.push('--env', `GOOGLE_API_KEY=${process.env['GOOGLE_API_KEY']}`);
  }

  // copy OPENAI_API_KEY and related env vars for Qwen
  if (process.env['OPENAI_API_KEY']) {
    args.push('--env', `OPENAI_API_KEY=${process.env['OPENAI_API_KEY']}`);
  }
  // copy TAVILY_API_KEY for web search tool
  if (process.env['TAVILY_API_KEY']) {
    args.push('--env', `TAVILY_API_KEY=${process.env['TAVILY_API_KEY']}`);
  }
  if (process.env['OPENAI_BASE_URL']) {
    args.push('--env', `OPENAI_BASE_URL=${process.env['OPENAI_BASE_URL']}`);
  }
  if (process.env['OPENAI_MODEL']) {
    args.push('--env', `OPENAI_MODEL=${process.env['OPENAI_MODEL']}`);
  }

  // copy GOOGLE_GENAI_USE_VERTEXAI
  if (process.env['GOOGLE_GENAI_USE_VERTEXAI']) {
    args.push(
      '--env',
      `GOOGLE_GENAI_USE_VERTEXAI=${process.env['GOOGLE_GENAI_USE_VERTEXAI']}`,
    );
  }

  // copy GOOGLE_GENAI_USE_GCA
  if (process.env['GOOGLE_GENAI_USE_GCA']) {
    args.push(
      '--env',
      `GOOGLE_GENAI_USE_GCA=${process.env['GOOGLE_GENAI_USE_GCA']}`,
    );
  }

  // copy GOOGLE_CLOUD_PROJECT
  if (process.env['GOOGLE_CLOUD_PROJECT']) {
    args.push(
      '--env',
      `GOOGLE_CLOUD_PROJECT=${process.env['GOOGLE_CLOUD_PROJECT']}`,
    );
  }

  // copy GOOGLE_CLOUD_LOCATION
  if (process.env['GOOGLE_CLOUD_LOCATION']) {
    args.push(
      '--env',
      `GOOGLE_CLOUD_LOCATION=${process.env['GOOGLE_CLOUD_LOCATION']}`,
    );
  }

  // copy GEMINI_MODEL
  if (process.env['GEMINI_MODEL']) {
    args.push('--env', `GEMINI_MODEL=${process.env['GEMINI_MODEL']}`);
  }

  // copy TERM and COLORTERM to try to maintain terminal setup
  if (process.env['TERM']) {
    args.push('--env', `TERM=${process.env['TERM']}`);
  }
  if (process.env['COLORTERM']) {
    args.push('--env', `COLORTERM=${process.env['COLORTERM']}`);
  }

  // Pass through IDE mode environment variables
  for (const envVar of [
    'QWEN_CODE_IDE_SERVER_PORT',
    'QWEN_CODE_IDE_WORKSPACE_PATH',
    'TERM_PROGRAM',
  ]) {
    if (process.env[envVar]) {
      args.push('--env', `${envVar}=${process.env[envVar]}`);
    }
  }

  // copy VIRTUAL_ENV if under working directory
  // also mount-replace VIRTUAL_ENV directory with <project_settings>/sandbox.venv
  // sandbox can then set up this new VIRTUAL_ENV directory using sandbox.bashrc (see below)
  // directory will be empty if not set up, which is still preferable to having host binaries
  if (
    process.env['VIRTUAL_ENV']?.toLowerCase().startsWith(workdir.toLowerCase())
  ) {
    const sandboxVenvPath = path.resolve(
      SETTINGS_DIRECTORY_NAME,
      'sandbox.venv',
    );
    if (!fs.existsSync(sandboxVenvPath)) {
      fs.mkdirSync(sandboxVenvPath, { recursive: true });
    }
    args.push(
      '--volume',
      `${sandboxVenvPath}:${getContainerPath(process.env['VIRTUAL_ENV'])}`,
    );
    args.push(
      '--env',
      `VIRTUAL_ENV=${getContainerPath(process.env['VIRTUAL_ENV'])}`,
    );
  }

  // copy additional environment variables from SANDBOX_ENV
  if (process.env['SANDBOX_ENV']) {
    for (let env of process.env['SANDBOX_ENV'].split(',')) {
      if ((env = env.trim())) {
        if (env.includes('=')) {
          writeStderrLine(`SANDBOX_ENV: ${env}`);
          args.push('--env', env);
        } else {
          throw new FatalSandboxError(
            'SANDBOX_ENV must be a comma-separated list of key=value pairs',
          );
        }
      }
    }
  }

  // copy NODE_OPTIONS
  const existingNodeOptions = process.env['NODE_OPTIONS'] || '';
  const allNodeOptions = [
    ...(existingNodeOptions ? [existingNodeOptions] : []),
    ...nodeArgs,
  ].join(' ');

  if (allNodeOptions.length > 0) {
    args.push('--env', `NODE_OPTIONS="${allNodeOptions}"`);
  }

  // set SANDBOX as container name
  args.push('--env', `SANDBOX=${containerName}`);

  // for podman only, use empty --authfile to skip unnecessary auth refresh overhead
  if (config.command === 'podman') {
    const emptyAuthFilePath = path.join(os.tmpdir(), 'empty_auth.json');
    fs.writeFileSync(emptyAuthFilePath, '{}', 'utf-8');
    args.push('--authfile', emptyAuthFilePath);
  }

  // Determine if the current user's UID/GID should be passed to the sandbox.
  // See shouldUseCurrentUserInSandbox for more details.
  let userFlag = '';
  const finalEntrypoint = entrypoint(workdir, cliArgs);

  // Check if we should use current user's UID/GID in sandbox
  // In integration test mode, we still respect SANDBOX_SET_UID_GID to allow
  // tests that need to access host's ~/.qwen (e.g., --resume functionality)
  const useCurrentUser = await shouldUseCurrentUserInSandbox();

  if (useCurrentUser) {
    // SANDBOX_SET_UID_GID is enabled: create user with host's UID/GID
    // This includes integration test mode with SANDBOX_SET_UID_GID=true,
    // allowing tests that need to access host's ~/.qwen (e.g., --resume) to work.
    // For the user-creation logic to work, the container must start as root.
    // The entrypoint script then handles dropping privileges to the correct user.
    args.push('--user', 'root');

    const uid = execSync('id -u').toString().trim();
    const gid = execSync('id -g').toString().trim();

    // Instead of passing --user to the main sandbox container, we let it
    // start as root, then create a user with the host's UID/GID, and
    // finally switch to that user to run the qwen process. This is
    // necessary on Linux to ensure the user exists within the
    // container's /etc/passwd file, which is required by os.userInfo().
    const username = 'qwen';
    const homeDir = getContainerPath(os.homedir());

    const setupUserCommands = [
      // Use -f with groupadd to avoid errors if the group already exists.
      `groupadd -f -g ${gid} ${username}`,
      // Create user only if it doesn't exist. Use -o for non-unique UID.
      `id -u ${username} &>/dev/null || useradd -o -u ${uid} -g ${gid} -d ${homeDir} -s /bin/bash ${username}`,
    ].join(' && ');

    const originalCommand = finalEntrypoint[2];
    const escapedOriginalCommand = originalCommand.replace(/'/g, "'\\''");

    // Use `su -p` to preserve the environment.
    const suCommand = `su -p ${username} -c '${escapedOriginalCommand}'`;

    // The entrypoint is always `['bash', '-c', '<command>']`, so we modify the command part.
    finalEntrypoint[2] = `${setupUserCommands} && ${suCommand}`;

    // We still need userFlag for the simpler proxy container, which does not have this issue.
    userFlag = `--user ${uid}:${gid}`;
    // When forcing a UID in the sandbox, $HOME can be reset to '/', so we copy $HOME as well.
    args.push('--env', `HOME=${os.homedir()}`);
  } else if (isIntegrationTest) {
    // Integration test mode with UID/GID matching disabled: use root
    args.push('--user', 'root');
    userFlag = '--user root';
  }
  // else: non-IT mode with UID/GID matching disabled - use image default user (node)

  // push container image name
  args.push(image);

  // push container entrypoint (including args)
  args.push(...finalEntrypoint);

  // start and set up proxy if QWEN_SANDBOX_PROXY_COMMAND is set
  let proxyProcess: ChildProcess | undefined = undefined;
  let sandboxProcess: ChildProcess | undefined = undefined;

  if (proxyCommand) {
    // run proxyCommand in its own container
    const proxyContainerCommand = `${config.command} run --rm --init ${userFlag} --name ${SANDBOX_PROXY_NAME} --network ${SANDBOX_PROXY_NAME} -p 8877:8877 -v ${process.cwd()}:${workdir} --workdir ${workdir} ${image} ${proxyCommand}`;
    const isWindows = os.platform() === 'win32';
    const proxyShell = isWindows ? 'cmd.exe' : 'bash';
    const proxyShellArgs = isWindows
      ? ['/c', proxyContainerCommand]
      : ['-c', proxyContainerCommand];
    // Note: CodeQL flags this as js/shell-command-injection-from-environment.
    // This is intentional - CLI tool executes user-provided proxy commands in container.
    proxyProcess = spawn(proxyShell, proxyShellArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    // install handlers to stop proxy on exit/signal
    const stopProxy = () => {
      writeStderrLine('stopping proxy container ...');
      execSync(`${config.command} rm -f ${SANDBOX_PROXY_NAME}`);
    };
    process.on('exit', stopProxy);
    process.on('SIGINT', stopProxy);
    process.on('SIGTERM', stopProxy);

    // commented out as it disrupts ink rendering
    // proxyProcess.stdout?.on('data', (data) => {
    //   console.info(data.toString());
    // });
    proxyProcess.stderr?.on('data', (data) => {
      writeStderrLine(data.toString().trim());
    });
    proxyProcess.on('close', (code, signal) => {
      if (sandboxProcess?.pid) {
        process.kill(-sandboxProcess.pid, 'SIGTERM');
      }
      throw new FatalSandboxError(
        `Proxy container command '${proxyContainerCommand}' exited with code ${code}, signal ${signal}`,
      );
    });
    writeStderrLine('waiting for proxy to start ...');
    await execAsync(
      `until timeout 0.25 curl -s http://localhost:8877; do sleep 0.25; done`,
    );
    // connect proxy container to sandbox network
    // (workaround for older versions of docker that don't support multiple --network args)
    await execAsync(
      `${config.command} network connect ${SANDBOX_NETWORK_NAME} ${SANDBOX_PROXY_NAME}`,
    );
  }

  // spawn child and let it inherit stdio
  process.stdin.pause();
  sandboxProcess = spawn(config.command, args, {
    stdio: 'inherit',
  });

  return new Promise<number>((resolve, reject) => {
    sandboxProcess.on('error', (err) => {
      writeStderrLine(`Sandbox process error: ${err}`);
      reject(err);
    });

    sandboxProcess?.on('close', (code, signal) => {
      process.stdin.resume();
      if (code !== 0 && code !== null) {
        writeStderrLine(
          `Sandbox process exited with code: ${code}, signal: ${signal}`,
        );
      }
      resolve(code ?? 1);
    });
  });
}

// Helper functions to ensure sandbox image is present
async function imageExists(sandbox: string, image: string): Promise<boolean> {
  return new Promise((resolve) => {
    const args = ['images', '-q', image];
    const checkProcess = spawn(sandbox, args);

    let stdoutData = '';
    if (checkProcess.stdout) {
      checkProcess.stdout.on('data', (data) => {
        stdoutData += data.toString();
      });
    }

    checkProcess.on('error', (err) => {
      writeStderrLine(
        `Failed to start '${sandbox}' command for image check: ${err.message}`,
      );
      resolve(false);
    });

    checkProcess.on('close', (code) => {
      // Non-zero code might indicate docker daemon not running, etc.
      // The primary success indicator is non-empty stdoutData.
      if (code !== 0) {
        // console.warn(`'${sandbox} images -q ${image}' exited with code ${code}.`);
      }
      resolve(stdoutData.trim() !== '');
    });
  });
}

async function pullImage(sandbox: string, image: string): Promise<boolean> {
  writeStderrLine(`Attempting to pull image ${image} using ${sandbox}...`);
  return new Promise((resolve) => {
    const args = ['pull', image];
    const pullProcess = spawn(sandbox, args, { stdio: 'pipe' });

    let stderrData = '';

    const onStdoutData = (data: Buffer) => {
      writeStderrLine(data.toString().trim()); // Show pull progress
    };

    const onStderrData = (data: Buffer) => {
      stderrData += data.toString();
      writeStderrLine(data.toString().trim()); // Show pull errors/info from the command itself
    };

    const onError = (err: Error) => {
      writeStderrLine(
        `Failed to start '${sandbox} pull ${image}' command: ${err.message}`,
      );
      cleanup();
      resolve(false);
    };

    const onClose = (code: number | null) => {
      if (code === 0) {
        writeStderrLine(`Successfully pulled image ${image}.`);
        cleanup();
        resolve(true);
      } else {
        writeStderrLine(
          `Failed to pull image ${image}. '${sandbox} pull ${image}' exited with code ${code}.`,
        );
        if (stderrData.trim()) {
          // Details already printed by the stderr listener above
        }
        cleanup();
        resolve(false);
      }
    };

    const cleanup = () => {
      if (pullProcess.stdout) {
        pullProcess.stdout.removeListener('data', onStdoutData);
      }
      if (pullProcess.stderr) {
        pullProcess.stderr.removeListener('data', onStderrData);
      }
      pullProcess.removeListener('error', onError);
      pullProcess.removeListener('close', onClose);
      if (pullProcess.connected) {
        pullProcess.disconnect();
      }
    };

    if (pullProcess.stdout) {
      pullProcess.stdout.on('data', onStdoutData);
    }
    if (pullProcess.stderr) {
      pullProcess.stderr.on('data', onStderrData);
    }
    pullProcess.on('error', onError);
    pullProcess.on('close', onClose);
  });
}

async function ensureSandboxImageIsPresent(
  sandbox: string,
  image: string,
): Promise<boolean> {
  writeStderrLine(`Checking for sandbox image: ${image}`);
  if (await imageExists(sandbox, image)) {
    writeStderrLine(`Sandbox image ${image} found locally.`);
    return true;
  }

  writeStderrLine(`Sandbox image ${image} not found locally.`);
  if (image === LOCAL_DEV_SANDBOX_IMAGE_NAME) {
    // user needs to build the image themselves
    return false;
  }

  if (await pullImage(sandbox, image)) {
    // After attempting to pull, check again to be certain
    if (await imageExists(sandbox, image)) {
      writeStderrLine(`Sandbox image ${image} is now available after pulling.`);
      return true;
    } else {
      writeStderrLine(
        `Sandbox image ${image} still not found after a pull attempt. This might indicate an issue with the image name or registry, or the pull command reported success but failed to make the image available.`,
      );
      return false;
    }
  }

  writeStderrLine(
    `Failed to obtain sandbox image ${image} after check and pull attempt.`,
  );
  return false; // Pull command failed or image still not present
}
