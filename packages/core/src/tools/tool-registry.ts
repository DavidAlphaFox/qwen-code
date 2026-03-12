/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 工具注册表模块
 *
 * 本模块负责管理 Qwen Code 系统中所有可用工具的注册、发现和检索。
 * 支持从命令行发现工具以及通过 MCP (Model Context Protocol) 服务器发现工具。
 * 提供统一的工具管理接口，包括工具注册、查找、执行等功能。
 */

import type { FunctionDeclaration } from '@google/genai';
import type {
  AnyDeclarativeTool,
  ToolResult,
  ToolResultDisplay,
  ToolInvocation,
} from './tools.js';
import { Kind, BaseDeclarativeTool, BaseToolInvocation } from './tools.js';
import type { Config } from '../config/config.js';
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import type { SendSdkMcpMessage } from './mcp-client.js';
import { McpClientManager } from './mcp-client-manager.js';
import { DiscoveredMCPTool } from './mcp-tool.js';
import { parse } from 'shell-quote';
import { ToolErrorType } from './tool-error.js';
import { safeJsonStringify } from '../utils/safeJsonStringify.js';
import type { EventEmitter } from 'node:events';
import { createDebugLogger } from '../utils/debugLogger.js';
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * 工具参数类型
 * 工具调用时使用的参数集合，键值对形式
 */
type ToolParams = Record<string, unknown>;

const debugLogger = createDebugLogger('TOOL_REGISTRY');

class DiscoveredToolInvocation extends BaseToolInvocation<
  ToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    private readonly toolName: string,
    params: ToolParams,
  ) {
    super(params);
  }

  getDescription(): string {
    return safeJsonStringify(this.params);
  }

  async execute(
    _signal: AbortSignal,
    _updateOutput?: (output: ToolResultDisplay) => void,
  ): Promise<ToolResult> {
    const callCommand = this.config.getToolCallCommand()!;
    const child = spawn(callCommand, [this.toolName]);
    child.stdin.write(JSON.stringify(this.params));
    child.stdin.end();

    let stdout = '';
    let stderr = '';
    let error: Error | null = null;
    let code: number | null = null;
    let signal: NodeJS.Signals | null = null;

    await new Promise<void>((resolve) => {
      const onStdout = (data: Buffer) => {
        stdout += data?.toString();
      };

      const onStderr = (data: Buffer) => {
        stderr += data?.toString();
      };

      const onError = (err: Error) => {
        error = err;
      };

      const onClose = (
        _code: number | null,
        _signal: NodeJS.Signals | null,
      ) => {
        code = _code;
        signal = _signal;
        cleanup();
        resolve();
      };

      const cleanup = () => {
        child.stdout.removeListener('data', onStdout);
        child.stderr.removeListener('data', onStderr);
        child.removeListener('error', onError);
        child.removeListener('close', onClose);
        if (child.connected) {
          child.disconnect();
        }
      };

      child.stdout.on('data', onStdout);
      child.stderr.on('data', onStderr);
      child.on('error', onError);
      child.on('close', onClose);
    });

    // if there is any error, non-zero exit code, signal, or stderr, return error details instead of stdout
    if (error || code !== 0 || signal || stderr) {
      const llmContent = [
        `Stdout: ${stdout || '(empty)'}`,
        `Stderr: ${stderr || '(empty)'}`,
        `Error: ${error ?? '(none)'}`,
        `Exit Code: ${code ?? '(none)'}`,
        `Signal: ${signal ?? '(none)'}`,
      ].join('\n');
      return {
        llmContent,
        returnDisplay: llmContent,
        error: {
          message: llmContent,
          type: ToolErrorType.DISCOVERED_TOOL_EXECUTION_ERROR,
        },
      };
    }

    return {
      llmContent: stdout,
      returnDisplay: stdout,
    };
  }
}

/**
 * 从项目发现的工具类
 *
 * 表示通过工具发现命令从项目中检测到的工具。
 * 这些工具会在调用时通过执行外部命令来运行。
 */
export class DiscoveredTool extends BaseDeclarativeTool<
  ToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    name: string,
    override readonly description: string,
    override readonly parameterSchema: Record<string, unknown>,
  ) {
    const discoveryCmd = config.getToolDiscoveryCommand()!;
    const callCommand = config.getToolCallCommand()!;
    description += `

This tool was discovered from the project by executing the command \`${discoveryCmd}\` on project root.
When called, this tool will execute the command \`${callCommand} ${name}\` on project root.
Tool discovery and call commands can be configured in project or user settings.

When called, the tool call command is executed as a subprocess.
On success, tool output is returned as a json string.
Otherwise, the following information is returned:

Stdout: Output on stdout stream. Can be \`(empty)\` or partial.
Stderr: Output on stderr stream. Can be \`(empty)\` or partial.
Error: Error or \`(none)\` if no error was reported for the subprocess.
Exit Code: Exit code or \`(none)\` if terminated by signal.
Signal: Signal number or \`(none)\` if no signal was received.
`;
    super(
      name,
      name,
      description,
      Kind.Other,
      parameterSchema,
      false, // isOutputMarkdown
      false, // canUpdateOutput
    );
  }

  protected createInvocation(
    params: ToolParams,
  ): ToolInvocation<ToolParams, ToolResult> {
    return new DiscoveredToolInvocation(this.config, this.name, params);
  }
}

/**
 * 工具注册表类
 *
 * 管理所有可用工具的注册、发现和检索。
 * 维护工具的索引，支持工具的动态发现和移除，
 * 提供 MCP (Model Context Protocol) 服务器的连接管理。
 */
export class ToolRegistry {
  // The tools keyed by tool name as seen by the LLM.
  private tools: Map<string, AnyDeclarativeTool> = new Map();
  private config: Config;
  private mcpClientManager: McpClientManager;

  constructor(
    config: Config,
    eventEmitter?: EventEmitter,
    sendSdkMcpMessage?: SendSdkMcpMessage,
  ) {
    this.config = config;
    this.mcpClientManager = new McpClientManager(
      this.config,
      this,
      eventEmitter,
      sendSdkMcpMessage,
    );
  }

  /**
   * 注册一个工具定义
   * @param tool - 包含 schema 和执行逻辑的工具对象
   */
  registerTool(tool: AnyDeclarativeTool): void {
    if (this.tools.has(tool.name)) {
      if (tool instanceof DiscoveredMCPTool) {
        tool = tool.asFullyQualifiedTool();
      } else {
        // Decide on behavior: throw error, log warning, or allow overwrite
        debugLogger.warn(
          `Tool with name "${tool.name}" is already registered. Overwriting.`,
        );
      }
    }
    this.tools.set(tool.name, tool);
  }

  private removeDiscoveredTools(): void {
    for (const tool of this.tools.values()) {
      if (tool instanceof DiscoveredTool || tool instanceof DiscoveredMCPTool) {
        this.tools.delete(tool.name);
      }
    }
  }

  /**
   * 从指定 MCP 服务器移除所有工具
   * @param serverName 要移除工具的服务器名称
   */
  removeMcpToolsByServer(serverName: string): void {
    for (const [name, tool] of this.tools.entries()) {
      if (tool instanceof DiscoveredMCPTool && tool.serverName === serverName) {
        this.tools.delete(name);
      }
    }
  }

  /**
   * 禁用 MCP 服务器，移除其工具、提示并断开客户端连接
   * 同时更新配置的排除列表
   * @param serverName 要禁用的服务器名称
   */
  async disableMcpServer(serverName: string): Promise<void> {
    // Remove tools from registry
    this.removeMcpToolsByServer(serverName);

    // Remove prompts
    this.config.getPromptRegistry().removePromptsByServer(serverName);

    // Disconnect the MCP client
    await this.mcpClientManager.disconnectServer(serverName);

    // Update config's exclusion list
    const currentExcluded = this.config.getExcludedMcpServers() || [];
    if (!currentExcluded.includes(serverName)) {
      this.config.setExcludedMcpServers([...currentExcluded, serverName]);
    }
  }

  /**
   * 从项目发现工具（如果可用且已配置）
   * 可以多次调用来更新发现的工具
   * 这将从命令行和 MCP 服务器发现工具
   */
  async discoverAllTools(): Promise<void> {
    // remove any previously discovered tools
    this.removeDiscoveredTools();

    this.config.getPromptRegistry().clear();

    await this.discoverAndRegisterToolsFromCommand();

    // discover tools using MCP servers, if configured
    await this.mcpClientManager.discoverAllMcpTools(this.config);
  }

  /**
   * 从项目发现工具（如果可用且已配置）
   * 可以多次调用来更新发现的工具
   * 这不会从命令行发现工具，只从 MCP 服务器发现
   */
  async discoverMcpTools(): Promise<void> {
    // remove any previously discovered tools
    this.removeDiscoveredTools();

    this.config.getPromptRegistry().clear();

    // discover tools using MCP servers, if configured
    await this.mcpClientManager.discoverAllMcpTools(this.config);
  }

  /**
   * 重启所有 MCP 服务器并重新发现工具
   */
  async restartMcpServers(): Promise<void> {
    await this.discoverMcpTools();
  }

  /**
   * 为单个 MCP 服务器发现或重新发现工具
   * @param serverName - 要发现工具的服务器名称
   */
  async discoverToolsForServer(serverName: string): Promise<void> {
    // Remove any previously discovered tools from this server
    for (const [name, tool] of this.tools.entries()) {
      if (tool instanceof DiscoveredMCPTool && tool.serverName === serverName) {
        this.tools.delete(name);
      }
    }

    this.config.getPromptRegistry().removePromptsByServer(serverName);

    await this.mcpClientManager.discoverMcpToolsForServer(
      serverName,
      this.config,
    );
  }

  private async discoverAndRegisterToolsFromCommand(): Promise<void> {
    const discoveryCmd = this.config.getToolDiscoveryCommand();
    if (!discoveryCmd) {
      return;
    }

    try {
      const cmdParts = parse(discoveryCmd);
      if (cmdParts.length === 0) {
        throw new Error(
          'Tool discovery command is empty or contains only whitespace.',
        );
      }
      const proc = spawn(cmdParts[0] as string, cmdParts.slice(1) as string[]);
      let stdout = '';
      const stdoutDecoder = new StringDecoder('utf8');
      let stderr = '';
      const stderrDecoder = new StringDecoder('utf8');
      let sizeLimitExceeded = false;
      const MAX_STDOUT_SIZE = 10 * 1024 * 1024; // 10MB limit
      const MAX_STDERR_SIZE = 10 * 1024 * 1024; // 10MB limit

      let stdoutByteLength = 0;
      let stderrByteLength = 0;

      proc.stdout.on('data', (data) => {
        if (sizeLimitExceeded) return;
        if (stdoutByteLength + data.length > MAX_STDOUT_SIZE) {
          sizeLimitExceeded = true;
          proc.kill();
          return;
        }
        stdoutByteLength += data.length;
        stdout += stdoutDecoder.write(data);
      });

      proc.stderr.on('data', (data) => {
        if (sizeLimitExceeded) return;
        if (stderrByteLength + data.length > MAX_STDERR_SIZE) {
          sizeLimitExceeded = true;
          proc.kill();
          return;
        }
        stderrByteLength += data.length;
        stderr += stderrDecoder.write(data);
      });

      await new Promise<void>((resolve, reject) => {
        proc.on('error', reject);
        proc.on('close', (code) => {
          stdout += stdoutDecoder.end();
          stderr += stderrDecoder.end();

          if (sizeLimitExceeded) {
            return reject(
              new Error(
                `Tool discovery command output exceeded size limit of ${MAX_STDOUT_SIZE} bytes.`,
              ),
            );
          }

          if (code !== 0) {
            debugLogger.error(
              `Tool discovery command failed with code ${code}`,
            );
            debugLogger.error(stderr);
            return reject(
              new Error(`Tool discovery command failed with exit code ${code}`),
            );
          }
          resolve();
        });
      });

      // execute discovery command and extract function declarations (w/ or w/o "tool" wrappers)
      const functions: FunctionDeclaration[] = [];
      const discoveredItems = JSON.parse(stdout.trim());

      if (!discoveredItems || !Array.isArray(discoveredItems)) {
        throw new Error(
          'Tool discovery command did not return a JSON array of tools.',
        );
      }

      for (const tool of discoveredItems) {
        if (tool && typeof tool === 'object') {
          if (Array.isArray(tool['function_declarations'])) {
            functions.push(...tool['function_declarations']);
          } else if (Array.isArray(tool['functionDeclarations'])) {
            functions.push(...tool['functionDeclarations']);
          } else if (tool['name']) {
            functions.push(tool as FunctionDeclaration);
          }
        }
      }
      // register each function as a tool
      for (const func of functions) {
        if (!func.name) {
          debugLogger.warn('Discovered a tool with no name. Skipping.');
          continue;
        }
        const parameters =
          func.parametersJsonSchema &&
          typeof func.parametersJsonSchema === 'object' &&
          !Array.isArray(func.parametersJsonSchema)
            ? func.parametersJsonSchema
            : {};
        this.registerTool(
          new DiscoveredTool(
            this.config,
            func.name,
            func.description ?? '',
            parameters as Record<string, unknown>,
          ),
        );
      }
    } catch (e) {
      debugLogger.error(`Tool discovery command "${discoveryCmd}" failed:`, e);
      throw e;
    }
  }

  /**
   * 获取工具 schema 列表 (FunctionDeclaration 数组)
   * 从 ToolListUnion 结构中提取声明
   * 如果配置了，则包含发现的（而非注册的）工具
   * @returns FunctionDeclaration 数组
   */
  getFunctionDeclarations(): FunctionDeclaration[] {
    const declarations: FunctionDeclaration[] = [];
    this.tools.forEach((tool) => {
      declarations.push(tool.schema);
    });
    return declarations;
  }

  /**
   * 根据工具名称列表获取过滤后的工具 schema 列表
   * @param toolNames - 要包含的工具名称数组
   * @returns 指定工具的 FunctionDeclaration 数组
   */
  getFunctionDeclarationsFiltered(toolNames: string[]): FunctionDeclaration[] {
    const declarations: FunctionDeclaration[] = [];
    for (const name of toolNames) {
      const tool = this.tools.get(name);
      if (tool) {
        declarations.push(tool.schema);
      }
    }
    return declarations;
  }

  /**
   * 返回所有已注册和已发现的工具名称数组
   */
  getAllToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * 返回所有已注册和已发现的工具实例数组
   */
  getAllTools(): AnyDeclarativeTool[] {
    return Array.from(this.tools.values()).sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    );
  }

  /**
   * 返回从特定 MCP 服务器注册的工具数组
   */
  getToolsByServer(serverName: string): AnyDeclarativeTool[] {
    const serverTools: AnyDeclarativeTool[] = [];
    for (const tool of this.tools.values()) {
      if ((tool as DiscoveredMCPTool)?.serverName === serverName) {
        serverTools.push(tool);
      }
    }
    return serverTools.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * 获取特定工具的定义
   */
  getTool(name: string): AnyDeclarativeTool | undefined {
    return this.tools.get(name);
  }

  /**
   * 从 MCP 服务器读取资源
   * @param serverName - MCP 服务器名称
   * @param uri - 资源 URI
   * @param options - 可选参数，包含中止信号
   * @returns 资源读取结果
   */
  async readMcpResource(
    serverName: string,
    uri: string,
    options?: { signal?: AbortSignal },
  ): Promise<ReadResourceResult> {
    if (!this.config.isTrustedFolder()) {
      throw new Error('MCP resources are unavailable in untrusted folders.');
    }

    return this.mcpClientManager.readResource(serverName, uri, options);
  }

  /**
   * 停止所有 MCP 客户端并清理资源
   * 此方法是幂等的，可以安全地多次调用
   */
  async stop(): Promise<void> {
    try {
      await this.mcpClientManager.stop();
    } catch (error) {
      // Log but don't throw - cleanup should be best-effort
      debugLogger.error('Error stopping MCP clients:', error);
    }
  }
}
