/**
 * 传输层接口
 *
 * 传输层抽象用于SDK与CLI之间的通信，支持多种传输机制：
 * - ProcessTransport：本地子进程通过stdin/stdout通信（当前实现）
 * - HttpTransport：通过HTTP连接远程CLI（未来计划）
 * - WebSocketTransport：通过WebSocket连接远程CLI（未来计划）
 */

/**
 * 传输层接口
 * 定义SDK与CLI通信的传输层契约
 */
export interface Transport {
  /**
   * 关闭传输层并释放资源
   */
  close(): Promise<void>;

  /**
   * 等待进程退出
   */
  waitForExit(): Promise<void>;

  /**
   * 写入消息到传输层
   * @param message - 要写入的消息
   */
  write(message: string): void;

  /**
   * 异步读取消息流
   */
  readMessages(): AsyncGenerator<unknown, void, unknown>;

  /**
   * 传输层是否已就绪
   */
  readonly isReady: boolean;

  /**
   * 进程退出错误
   */
  readonly exitError: Error | null;
}
