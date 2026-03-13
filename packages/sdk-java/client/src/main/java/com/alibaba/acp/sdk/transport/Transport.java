package com.alibaba.acp.sdk.transport;

import java.io.IOException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeoutException;
import java.util.function.Function;

/**
 * 传输层接口
 * 
 * 定义与AI代理通信的传输层契约，包括消息发送、接收和连接管理功能。
 * 实现此接口的类应提供可靠的消息传输机制。
 *
 * @author SkyFire
 * @version 0.0.1
 */
public interface Transport {
    /**
     * 检查传输层是否正在读取
     *
     * @return 如果正在读取返回true，否则返回false
     */
    boolean isReading();

    /**
     * 启动传输层
     *
     * @throws IOException 如果启动失败抛出IO异常
     */
    void start() throws IOException;

    /**
     * 关闭传输层并释放资源
     *
     * @throws IOException 如果关闭失败抛出IO异常
     */
    void close() throws IOException;

    /**
     * 检查传输层是否可用于通信
     *
     * @return 如果可用返回true，否则返回false
     */
    boolean isAvailable();

    /**
     * 发送消息并等待单行响应
     *
     * @param message 要发送的消息
     * @return 响应消息
     * @throws IOException 如果发生IO错误
     * @throws ExecutionException 如果发生执行错误
     * @throws InterruptedException 如果操作被中断
     * @throws TimeoutException 如果操作超时
     */
    String inputWaitForOneLine(String message) throws IOException, ExecutionException, InterruptedException, TimeoutException;

    /**
     * 发送消息并等待多行响应
     *
     * @param message 要发送的消息
     * @param callBackFunction 处理每行响应的函数
     * @throws IOException 如果发生IO错误
     */
    void inputWaitForMultiLine(String message, Function<String, Boolean> callBackFunction) throws IOException;

    /**
     * 发送消息而不等待响应
     *
     * @param message 要发送的消息
     * @throws IOException 如果发生IO错误
     */
    void inputNoWaitResponse(String message) throws IOException;
}
