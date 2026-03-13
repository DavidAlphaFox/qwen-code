/**
 * 异步流类
 * 实现AsyncIterable接口，用于异步消息处理
 */
export class Stream<T> implements AsyncIterable<T> {
  private returned: (() => void) | undefined;
  private queue: T[] = [];
  private readResolve: ((result: IteratorResult<T>) => void) | undefined;
  private readReject: ((error: Error) => void) | undefined;
  private isDone = false;
  hasError: Error | undefined;
  private started = false;

  /**
   * 创建异步流实例
   * @param returned - 可选的完成回调函数
   */
  constructor(returned?: () => void) {
    this.returned = returned;
  }

  /**
   * 获取异步迭代器
   */
  [Symbol.asyncIterator](): AsyncIterator<T> {
    if (this.started) {
      throw new Error('Stream can only be iterated once');
    }
    this.started = true;
    return this;
  }

  /**
   * 获取下一个迭代结果
   */
  async next(): Promise<IteratorResult<T>> {
    if (this.queue.length > 0) {
      return Promise.resolve({
        done: false,
        value: this.queue.shift()!,
      });
    }
    if (this.hasError) {
      return Promise.reject(this.hasError);
    }
    if (this.isDone) {
      return Promise.resolve({ done: true, value: undefined });
    }
    return new Promise<IteratorResult<T>>((resolve, reject) => {
      this.readResolve = resolve;
      this.readReject = reject;
    });
  }

  /**
   * 入队消息
   * @param value - 要入队的值
   */
  enqueue(value: T): void {
    if (this.readResolve) {
      const resolve = this.readResolve;
      this.readResolve = undefined;
      this.readReject = undefined;
      resolve({ done: false, value });
    } else {
      this.queue.push(value);
    }
  }

  /**
   * 标记流完成
   */
  done(): void {
    this.isDone = true;
    if (this.readResolve) {
      const resolve = this.readResolve;
      this.readResolve = undefined;
      this.readReject = undefined;
      resolve({ done: true, value: undefined });
    }
  }

  /**
   * 设置流错误
   * @param error - 错误对象
   */
  error(error: Error): void {
    this.hasError = error;
    if (this.readReject) {
      const reject = this.readReject;
      this.readResolve = undefined;
      this.readReject = undefined;
      reject(error);
    }
  }

  /**
   * 返回迭代器
   */
  return(): Promise<IteratorResult<T>> {
    this.isDone = true;
    if (this.returned) {
      this.returned();
    }
    return Promise.resolve({ done: true, value: undefined });
  }
}
