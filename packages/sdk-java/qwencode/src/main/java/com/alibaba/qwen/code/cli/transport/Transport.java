package com.alibaba.qwen.code.cli.transport;

import java.io.IOException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeoutException;
import java.util.function.Function;

/**
 * 传输层接口
 * 
 * 定义与Qwen Code CLI通信的契约。
 *
 * @author skyfire
 * @version $Id: 0.0.1
 */
public interface Transport {
    /**
     * 获取此传输层使用的传输选项
     *
     * @return 传输选项
     */
    TransportOptions getTransportOptions();

    /**
     * 检查传输层是否正在读取
     *
     * @return 如果正在读取返回true，否则返回false
     */
    boolean isReading();

    /**
     * 启动传输层
     *
     * @throws java.io.IOException 如果启动失败
     */
    void start() throws IOException;

    /**
     * 关闭传输层并释放资源
     *
     * @throws java.io.IOException 如果关闭失败
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
     * @throws java.io.IOException 如果发生IO错误
     * @throws java.util.concurrent.ExecutionException 如果发生执行错误
     * @throws java.lang.InterruptedException 如果操作被中断
     * @throws java.util.concurrent.TimeoutException 如果操作超时
     */
    String inputWaitForOneLine(String message) throws IOException, ExecutionException, InterruptedException, TimeoutException;

    /**
     * 发送消息并等待多行响应
     *
     * @param message 要发送的消息
     * @param callBackFunction 处理每行响应的函数
     * @throws java.io.IOException 如果发生IO错误
     */
    void inputWaitForMultiLine(String message, Function<String, Boolean> callBackFunction) throws IOException;

    /**
     * 发送消息而不等待响应
     *
     * @param message 要发送的消息
     * @throws java.io.IOException 如果发生IO错误
     */
    void inputNoWaitResponse(String message) throws IOException;
}
