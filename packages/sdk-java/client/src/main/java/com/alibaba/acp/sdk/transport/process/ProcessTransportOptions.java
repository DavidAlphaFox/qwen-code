package com.alibaba.acp.sdk.transport.process;

import java.util.function.Consumer;

import com.alibaba.acp.sdk.utils.Timeout;

/**
 * ProcessTransport配置选项类
 * 
 * 此类提供ProcessTransport的配置选项，包括工作目录、命令参数、错误处理和各操作的超时设置。
 *
 * @author SkyFire
 * @version 0.0.1
 */
public class ProcessTransportOptions {
    private String cwd;
    private String[] commandArgs;
    private Consumer<String> errorHandler;
    private Timeout turnTimeout;
    private Timeout messageTimeout;

    /**
     * 获取进程的当前工作目录
     *
     * @return 当前工作目录
     */
    public String getCwd() {
        return cwd;
    }

    /**
     * 设置进程的当前工作目录
     *
     * @param cwd 当前工作目录
     * @return 当前实例，用于方法链
     */
    public ProcessTransportOptions setCwd(String cwd) {
        this.cwd = cwd;
        return this;
    }

    /**
     * 获取进程的命令参数
     *
     * @return 命令参数数组
     */
    public String[] getCommandArgs() {
        return commandArgs;
    }

    /**
     * 设置进程的命令参数
     *
     * @param commandArgs 命令参数数组
     * @return 当前实例，用于方法链
     */
    public ProcessTransportOptions setCommandArgs(String[] commandArgs) {
        this.commandArgs = commandArgs;
        return this;
    }

    /**
     * 获取错误处理器，用于处理错误消息
     *
     * @return 错误消息的消费者
     */
    public Consumer<String> getErrorHandler() {
        return errorHandler;
    }

    /**
     * 设置错误处理器，用于处理错误消息
     *
     * @param errorHandler 错误消息的消费者
     * @return 当前实例，用于方法链
     */
    public ProcessTransportOptions setErrorHandler(Consumer<String> errorHandler) {
        this.errorHandler = errorHandler;
        return this;
    }

    /**
     * 获取对话轮次的超时时间
     *
     * @return 对话轮次的超时时间
     */
    public Timeout getTurnTimeout() {
        return turnTimeout;
    }

    /**
     * 设置对话轮次的超时时间
     *
     * @param turnTimeout 对话轮次的超时时间
     * @return 当前实例，用于方法链
     */
    public ProcessTransportOptions setTurnTimeout(Timeout turnTimeout) {
        this.turnTimeout = turnTimeout;
        return this;
    }

    /**
     * 获取单条消息的超时时间
     *
     * @return 单条消息的超时时间
     */
    public Timeout getMessageTimeout() {
        return messageTimeout;
    }

    /**
     * 设置单条消息的超时时间
     *
     * @param messageTimeout 单条消息的超时时间
     * @return 当前实例，用于方法链
     */
    public ProcessTransportOptions setMessageTimeout(Timeout messageTimeout) {
        this.messageTimeout = messageTimeout;
        return this;
    }
}
