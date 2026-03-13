/**
 * SdkControlServerTransport - SDK控制服务器传输层
 *
 * 实现@modelcontextprotocol/sdk的Transport接口，
 * 用于支持SDK嵌入的MCP服务器。消息双向流动：
 *
 * MCP Server → send() → Query → control_request (mcp_message) → CLI
 * CLI → control_request (mcp_message) → Query → handleMessage() → MCP Server
 */

import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { SdkLogger } from '../utils/logger.js';

/**
 * 发送到Query的回调函数类型
 */
export type SendToQueryCallback = (message: JSONRPCMessage) => Promise<void>;

/**
 * SDK控制服务器传输层选项
 */
export interface SdkControlServerTransportOptions {
  /** 发送到Query的回调函数 */
  sendToQuery: SendToQueryCallback;
  /** 服务器名称 */
  serverName: string;
}

/**
 * SDK控制服务器传输层类
 * 连接MCP服务器与Query的控制平面
 */
export class SdkControlServerTransport {
  sendToQuery: SendToQueryCallback;
  private serverName: string;
  private started = false;
  private logger;

  /** 消息处理回调 */
  onmessage?: (message: JSONRPCMessage) => void;
  /** 错误处理回调 */
  onerror?: (error: Error) => void;
  /** 关闭回调 */
  onclose?: () => void;

  /**
   * 创建SDK控制服务器传输层
   * @param options - 传输层选项
   */
  constructor(options: SdkControlServerTransportOptions) {
    this.sendToQuery = options.sendToQuery;
    this.serverName = options.serverName;
    this.logger = SdkLogger.createLogger(
      `SdkControlServerTransport:${options.serverName}`,
    );
  }

  /**
   * 启动传输层
   */
  async start(): Promise<void> {
    this.started = true;
    this.logger.debug('Transport started');
  }

  /**
   * 发送消息
   * @param message - 要发送的JSON-RPC消息
   */
  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.started) {
      throw new Error(
        `SdkControlServerTransport (${this.serverName}) not started. Call start() first.`,
      );
    }

    try {
      this.logger.debug('Sending message to Query', message);
      await this.sendToQuery(message);
    } catch (error) {
      this.logger.error('Error sending message:', error);
      if (this.onerror) {
        this.onerror(error instanceof Error ? error : new Error(String(error)));
      }
      throw error;
    }
  }

  /**
   * 关闭传输层
   */
  async close(): Promise<void> {
    if (!this.started) {
      return; // 已关闭
    }

    this.started = false;
    this.logger.debug('Transport closed');

    // 通知MCP服务器
    if (this.onclose) {
      this.onclose();
    }
  }

  /**
   * 处理接收到的消息
   * @param message - 要处理的JSON-RPC消息
   */
  handleMessage(message: JSONRPCMessage): void {
    if (!this.started) {
      this.logger.warn('Received message for closed transport');
      return;
    }

    this.logger.debug('Handling message from CLI', message);
    if (this.onmessage) {
      this.onmessage(message);
    } else {
      this.logger.warn('No onmessage handler set');
    }
  }

  /**
   * 处理错误
   * @param error - 错误对象
   */
  handleError(error: Error): void {
    this.logger.error('Transport error:', error);
    if (this.onerror) {
      this.onerror(error);
    }
  }

  /**
   * 检查传输层是否已启动
   */
  isStarted(): boolean {
    return this.started;
  }

  /**
   * 获取服务器名称
   */
  getServerName(): string {
    return this.serverName;
  }
}
