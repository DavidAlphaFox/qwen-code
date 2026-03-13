package com.alibaba.qwen.code.cli;

import java.util.ArrayList;
import java.util.List;

import com.alibaba.fastjson2.JSON;
import com.alibaba.qwen.code.cli.protocol.data.AssistantUsage;
import com.alibaba.qwen.code.cli.protocol.data.AssistantContent;
import com.alibaba.qwen.code.cli.protocol.data.AssistantContent.TextAssistantContent;
import com.alibaba.qwen.code.cli.protocol.data.AssistantContent.ThingkingAssistantContent;
import com.alibaba.qwen.code.cli.protocol.data.AssistantContent.ToolResultAssistantContent;
import com.alibaba.qwen.code.cli.protocol.data.AssistantContent.ToolUseAssistantContent;
import com.alibaba.qwen.code.cli.protocol.data.behavior.Behavior.Operation;
import com.alibaba.qwen.code.cli.session.Session;
import com.alibaba.qwen.code.cli.session.event.consumers.AssistantContentConsumers;
import com.alibaba.qwen.code.cli.session.event.consumers.AssistantContentSimpleConsumers;
import com.alibaba.qwen.code.cli.session.event.consumers.SessionEventSimpleConsumers;
import com.alibaba.qwen.code.cli.transport.Transport;
import com.alibaba.qwen.code.cli.transport.TransportOptions;
import com.alibaba.qwen.code.cli.transport.process.ProcessTransport;
import com.alibaba.qwen.code.cli.utils.MyConcurrentUtils;
import com.alibaba.qwen.code.cli.utils.Timeout;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Qwen Code CLI交互主入口类
 * 
 * 提供静态方法用于简单查询和会话管理。
 *
 * @author skyfire
 * @version $Id: 0.0.1
 */
public class QwenCodeCli {
    private static final Logger log = LoggerFactory.getLogger(QwenCodeCli.class);

    /**
     * 发送简单查询到Qwen Code CLI并返回响应列表
     *
     * @param prompt 要发送给CLI的输入提示
     * @return 包含CLI响应的字符串列表
     */
    public static List<String> simpleQuery(String prompt) {
        return simpleQuery(prompt, new TransportOptions());
    }

    /**
     * 使用自定义传输选项发送简单查询
     *
     * @param prompt 要发送给CLI的输入提示
     * @param transportOptions 传输层配置选项
     * @return 包含CLI响应的字符串列表
     */
    public static List<String> simpleQuery(String prompt, TransportOptions transportOptions) {
        final List<String> response = new ArrayList<>();
        MyConcurrentUtils.runAndWait(() -> simpleQuery(prompt, transportOptions, new AssistantContentSimpleConsumers() {
            @Override
            public void onText(Session session, TextAssistantContent textAssistantContent) {
                response.add(textAssistantContent.getText());
            }

            @Override
            public void onThinking(Session session, ThingkingAssistantContent thingkingAssistantContent) {
                response.add(thingkingAssistantContent.getThinking());
            }

            @Override
            public void onToolUse(Session session, ToolUseAssistantContent toolUseAssistantContent) {
                response.add(JSON.toJSONString(toolUseAssistantContent.getContentOfAssistant()));
            }

            @Override
            public void onToolResult(Session session, ToolResultAssistantContent toolResultAssistantContent) {
                response.add(JSON.toJSONString(toolResultAssistantContent));
            }

            public void onOtherContent(Session session, AssistantContent<?> other) {
                response.add(JSON.toJSONString(other.getContentOfAssistant()));
            }

            @Override
            public void onUsage(Session session, AssistantUsage assistantUsage) {
                log.info("received usage {} of message {}", assistantUsage.getUsage(), assistantUsage.getMessageId());
            }
        }.setDefaultPermissionOperation(Operation.allow)), Timeout.TIMEOUT_30_MINUTES);
        return response;
    }

    /**
     * Sends a query with custom content consumers.
     *
     * @param prompt The input prompt to send to the CLI
     * @param transportOptions Configuration options for the transport layer
     * @param assistantContentConsumers Consumers for handling different types of assistant content
     */
    public static void simpleQuery(String prompt, TransportOptions transportOptions, AssistantContentConsumers assistantContentConsumers) {
        Session session = newSession(transportOptions);
        try {
            session.sendPrompt(prompt, new SessionEventSimpleConsumers()
                    .setAssistantContentConsumer(assistantContentConsumers));
        } catch (Exception e) {
            throw new RuntimeException("sendPrompt error!", e);
        } finally {
            try {
                session.close();
            } catch (Exception e) {
                log.error("close session error!", e);
            }
        }
    }

    /**
     * Creates a new session with default transport options.
     *
     * @return A new Session instance
     */
    public static Session newSession() {
        return newSession(new TransportOptions());
    }

    /**
     * Creates a new session with custom transport options.
     *
     * @param transportOptions Configuration options for the transport layer
     * @return A new Session instance
     */
    public static Session newSession(TransportOptions transportOptions) {
        Transport transport;
        try {
            transport = new ProcessTransport(transportOptions);
        } catch (Exception e) {
            throw new RuntimeException("initialized ProcessTransport error!", e);
        }

        Session session;
        try {
            session = new Session(transport);
        } catch (Exception e) {
            throw new RuntimeException("initialized Session error!", e);
        }
        return session;
    }
}
