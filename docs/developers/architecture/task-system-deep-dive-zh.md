# Qwen Code Task 系统深度解析

本文档深入讲解 Qwen Code 的 Task/Subagent 系统的架构、提示词机制、运作模式以及如何防止 Doom Loop（无限循环）。

---

## 目录

1. [系统架构概览](#系统架构概览)
2. [提示词系统](#提示词系统)
3. [任务执行模式](#任务执行模式)
4. [Doom Loop 防护机制](#doom-loop-防护机制)
5. [完整的执行流程](#完整的执行流程)
6. [性能统计与监控](#性能统计与监控)

---

## 系统架构概览

Qwen Code 的 Task 系统采用**分层代理架构**，由以下核心组件构成：

### 核心组件

```
Task Tool (主工具)
    ↓
SubagentManager (子代理管理器)
    ↓
SubAgentScope (子代理作用域)
    ↓
LoopDetectionService (循环检测服务)
    ↓
Tool Scheduler (工具调度器)
```

### 关键类型

**SubagentConfig** - 文件存储的配置

```typescript
interface SubagentConfig {
  name: string; // 唯一标识符
  description: string; // 人类可读的描述
  tools?: string[]; // 允许使用的工具列表
  systemPrompt: string; // 系统提示词内容
  level: SubagentLevel; // 存储级别
  modelConfig?: ModelConfig; // 模型配置
  runConfig?: RunConfig; // 运行时配置
  color?: string; // 显示颜色
  isBuiltin?: boolean; // 是否为内置代理
  filePath?: string; // 配置文件的绝对路径（session 级别可选）
}
```

**SubagentLevel** - 存储级别（优先级从高到低）

```typescript
type SubagentLevel =
  | 'session' // 运行时提供，优先级最高（覆盖其他）
  | 'project' // 项目级：.qwen/agents/*.md
  | 'user' // 用户级：~/.qwen/agents/*.md
  | 'extension' // 扩展提供
  | 'builtin'; // 内置代理，优先级最低
```

**文件存储格式**

子代理使用 **Markdown 文件 + YAML frontmatter** 格式：

```markdown
---
name: my-agent
description: Does X, Y, Z
tools:
  - read
  - grep
  - edit
runConfig:
  max_time_minutes: 30
  max_turns: 50
modelConfig:
  model: qwen3-coder-plus
  temp: 0.3
color: '#FF6B6B'
---

你是一个 ${role} 代理。
你的任务是完成：${task}

约束条件：

- ${constraint_1}
- ${constraint_2}
```

**RunConfig** - 运行时约束

```typescript
interface RunConfig {
  max_time_minutes?: number; // 最大执行时间（分钟）
  max_turns?: number; // 最大对话轮次
}
```

---

## 提示词系统

### 提示词配置选项

子代理支持**两种提示词模式**，但必须二选一：

#### 1. System Prompt 模式

```typescript
interface PromptConfig {
  systemPrompt?: string; // 单个系统提示词字符串
}
```

**特点：**

- 支持 `${variable}` 变量模板化
- 变量值来自 `ContextState`
- 会自动添加非交互模式规则
- 会附加用户记忆（QWEN.md + output-language.md）

**示例：**

```typescript
const config = {
  name: 'code-reviewer',
  systemPrompt: `
You are a code review expert specialized in ${language}.
Focus on: ${focus_areas}

Guidelines:
- ${guideline_1}
- ${guideline_2}
  `,
};
```

#### 2. Initial Messages 模式

```typescript
interface PromptConfig {
  initialMessages?: Content[]; // 内容数组，用于 few-shot prompting
}
```

**特点：**

- 用于 few-shot 提示
- 可以预填充对话历史
- 不使用变量模板化

**验证规则：**

- `systemPrompt` 和 `initialMessages` **不能同时存在**
- systemPrompt 长度：10 ~ 10,000 字符
- initialMessages 长度：无限制（但影响 token 使用）

### 变量模板化引擎

`templateString` 函数实现变量替换：

```typescript
function templateString(template: string, context: ContextState): string {
  const placeholderRegex = /\$\{(\w+)\}/g;

  // 1. 提取所有需要的变量
  const requiredKeys = new Set(
    Array.from(template.matchAll(placeholderRegex), (match) => match[1]),
  );

  // 2. 验证所有变量都存在
  const missingKeys = Array.from(requiredKeys).filter(
    (key) => !contextKeys.has(key),
  );

  if (missingKeys.length > 0) {
    throw new Error(`Missing context values for: ${missingKeys.join(', ')}`);
  }

  // 3. 执行替换
  return template.replace(placeholderRegex, (_match, key) =>
    String(context.get(key)),
  );
}
```

**使用示例：**

```typescript
const context = new ContextState();
context.set('language', 'TypeScript');
context.set('focus_areas', 'performance, security');

const prompt = `
You are a ${language} expert.
Focus areas: ${focus_areas}
`;

const final = templateString(prompt, context);
// 输出:
// "
// You are a TypeScript expert.
// Focus areas: performance, security
// "
```

### ContextState - 上下文状态管理

```typescript
class ContextState {
  private state: Record<string, unknown> = {};

  set(key: string, value: unknown): void;
  get(key: string): unknown;
  get_keys(): string[];
}
```

**用途：**

- 存储任务提示（`task_prompt`）
- 存储用户提供的变量
- 在子代理执行期间传递上下文

### 内置代理示例

Qwen Code 提供一个 `general-purpose` 内置代理：

```typescript
{
  name: 'general-purpose',
  description: 'General-purpose agent for researching complex questions...',
  systemPrompt: `
You are a general-purpose research and code analysis agent.

Your strengths:
- Searching for code, configurations, and patterns across large codebases
- Analyzing multiple files to understand system architecture

Guidelines:
- For file searches: Use Grep or Glob when you need to search broadly
- NEVER create files unless they're absolutely necessary
- ALWAYS prefer editing an existing file to creating a new one

Notes:
- NEVER proactively create documentation files (*.md) or README files
- In your final response always share relevant file names and code snippets
- Any file paths you return MUST be absolute. Do NOT use relative paths
- For clear communication, avoid using emojis
  `
}
```

### 子代理管理器（SubagentManager）

SubagentManager 负责代理的 CRUD 操作和配置加载：

**配置加载优先级：**

```typescript
1. session-level     // 运行时提供（覆盖所有）
2. project-level     // .qwen/agents/*.md
3. user-level       // ~/.qwen/agents/*.md
4. extension-level  // 扩展提供
5. builtin-level    // 内置代理（最低优先级）
```

**Markdown + YAML 解析：**

```typescript
// SubagentManager 解析代理文件
parseAgentFile(markdownContent: string): SubagentConfig {
  // 1. 提取 YAML frontmatter（--- 之间）
  const frontmatter = extractYamlFrontmatter(markdownContent);
  const systemPrompt = markdownContent.split('---')[2]; // 之后的内容

  // 2. 转换为 SubagentConfig
  return {
    ...frontmatter,
    systemPrompt,
    filePath: absolutePath,
  };
}
```

**验证：**

- 使用 `SubagentValidator` 验证所有配置
- 检查名称、描述、提示词、工具列表、模型配置、运行配置
- 返回错误和警告列表

### 完整的系统提示词构建流程

```typescript
private buildChatSystemPrompt(context: ContextState): string {
  // 1. 模板化用户提供的 systemPrompt
  let finalPrompt = templateString(this.promptConfig.systemPrompt, context);

  // 2. 添加非交互模式规则
  finalPrompt += `

Important Rules:
- You operate in non-interactive mode: do not ask questions
- Use tools only when necessary
- When task is complete, return final result (not a tool call) and stop.`;

  // 3. 附加用户记忆（QWEN.md + output-language.md）
  const userMemory = this.runtimeContext.getUserMemory();
  if (userMemory && userMemory.trim().length > 0) {
    finalPrompt += `\n\n---\n\n${userMemory.trim()}`;
  }

  return finalPrompt;
}
```

---

## 任务执行模式

### 执行方式

#### 非交互模式（runNonInteractive）

这是子代理的**主要执行模式**，特点：

**特性：**

- 🔒 完全自主运行，不接受用户输入
- 🔄 单轮对话循环（while(true)）
- ⏱️ 实时检查终止条件
- 📊 详细的统计和遥测
- 🎯 单次执行，完成后返回结果

**关键流程：**

```typescript
async runNonInteractive(context: ContextState, externalSignal?: AbortSignal): Promise<void> {
  // 1. 创建聊天对象
  const chat = await this.createChatObject(context);

  // 2. 准备工具列表
  const toolsList = prepareTools(this.toolConfig, toolRegistry);

  // 3. 初始化执行状态
  let turnCounter = 0;
  let currentMessages = [{ role: 'user', parts: [{ text: initialTaskText }] }];
  const startTime = Date.now();

  try {
    while (true) {
      // 4. 创建每轮的 AbortController
      const roundAbortController = new AbortController();

      // 5. 检查终止条件
      if (this.runConfig.max_turns && turnCounter >= this.runConfig.max_turns) {
        this.terminateMode = SubagentTerminateMode.MAX_TURNS;
        break;
      }

      let durationMin = (Date.now() - startTime) / (1000 * 60);
      if (this.runConfig.max_time_minutes && durationMin >= this.runConfig.max_time_minutes) {
        this.terminateMode = SubagentTerminateMode.TIMEOUT;
        break;
      }

      // 6. 调用 LLM 并流式处理响应
      const responseStream = await chat.sendMessageStream(...);
      for await (const streamEvent of responseStream) {
        if (roundAbortController.signal.aborted) {
          this.terminateMode = SubagentTerminateMode.CANCELLED;
          return;
        }

        // 7. 处理流式事件（工具调用、文本内容）
        processStreamEvent(streamEvent, functionCalls, roundText);
      }

      // 8. 执行工具调用
      if (functionCalls.length > 0) {
        currentMessages = await this.processFunctionCalls(...);
      } else {
        // 没有工具调用 - 认为最终答案
        if (roundText && roundText.trim().length > 0) {
          this.finalText = roundText.trim();
          this.terminateMode = SubagentTerminateMode.GOAL;
          break;
        }

        // 否则，引导模型完成
        currentMessages = [{
          role: 'user',
          parts: [{ text: 'Please provide final result and stop.' }],
        }];
      }

      turnCounter++;
    }
  } catch (error) {
    this.terminateMode = SubagentTerminateMode.ERROR;
    throw error;
  } finally {
    // 9. 发送完成事件
    this.eventEmitter.emit(SubAgentEventType.FINISH, { ... });
    logTelemetry();
  }
}
```

### 工具调度策略

#### CoreToolScheduler 支持两种模式

**1. 串行执行（默认）**

- 工具按顺序一个接一个执行
- 等待前一个工具完成后再执行下一个
- 适用于有依赖关系的工具调用

**2. 并行执行**

- 多个工具同时执行
- 通过 `canExecuteInParallel` 配置
- 适用于独立、无依赖的工具调用

**执行状态机：**

```typescript
type ToolCallStatus =
  | 'validating' // 验证参数
  | 'scheduled' // 已调度，等待执行
  | 'executing' // 正在执行
  | 'awaiting_approval' // 等待用户批准
  | 'success' // 成功完成
  | 'cancelled' // 被取消
  | 'error'; // 执行失败
```

### 事件驱动架构

子代理通过 **事件发射器** 提供实时进度：

```typescript
enum SubAgentEventType {
  START, // 子代理启动
  ROUND_START, // 新轮次开始
  STREAM_TEXT, // 文本流式输出
  TOOL_CALL, // 工具调用
  TOOL_RESULT, // 工具调用结果
  TOOL_WAITING_APPROVAL, // 等待批准
  ROUND_END, // 轮次结束
  USAGE_METADATA, // 使用元数据（tokens）
  FINISH, // 子代理完成
  ERROR, // 错误发生
}
```

**UI 集成示例：**

```typescript
eventEmitter.on(SubAgentEventType.TOOL_CALL, (event) => {
  updateUI({
    subagentId: event.subagentId,
    toolName: event.name,
    status: 'executing',
    timestamp: event.timestamp,
  });
});
```

---

## Doom Loop 防护机制

Qwen Code 采用**多层防护**来防止无限循环：

### 第一层：RunConfig 硬限制

#### 1. 最大轮次限制

```typescript
interface RunConfig {
  max_turns?: number; // 默认建议：50-100
}
```

**工作原理：**

- 每次对话轮次递增 `turnCounter`
- 当 `turnCounter >= max_turns` 时立即终止
- 终止模式：`SubagentTerminateMode.MAX_TURNS`

**验证规则：**

```typescript
if (runConfig.max_turns !== undefined) {
  if (!Number.isInteger(runConfig.max_turns)) {
    errors.push('max_turns must be an integer');
  } else if (runConfig.max_turns <= 0) {
    errors.push('max_turns must be greater than 0');
  } else if (runConfig.max_turns > 100) {
    warnings.push('Very high turn limit (>100) may cause long execution');
  }
}
```

#### 2. 最大时间限制

```typescript
interface RunConfig {
  max_time_minutes?: number; // 默认建议：10-30 分钟
}
```

**工作原理：**

- 每轮检查执行时间：`durationMin = (Date.now() - startTime) / 60000`
- 当 `durationMin >= max_time_minutes` 时立即终止
- 终止模式：`SubagentTerminateMode.TIMEOUT`

**验证规则：**

```typescript
if (runConfig.max_time_minutes !== undefined) {
  if (typeof runConfig.max_time_minutes !== 'number') {
    errors.push('max_time_minutes must be a number');
  } else if (runConfig.max_time_minutes <= 0) {
    errors.push('max_time_minutes must be greater than 0');
  } else if (runConfig.max_time_minutes > 60) {
    warnings.push(
      'Very long execution time (>60 minutes) may cause resource issues',
    );
  }
}
```

### 第二层：LoopDetectionService 智能检测

这是**专门的循环检测服务**，使用高级算法检测两种循环类型：

#### 1. 工具调用循环检测

**检测逻辑：**

```typescript
private checkToolCallLoop(toolCall: { name: string; args: object }): boolean {
  const key = this.getToolCallKey(toolCall);
  if (this.lastToolCallKey === key) {
    this.toolCallRepetitionCount++;
  } else {
    this.lastToolCallKey = key;
    this.toolCallRepetitionCount = 1;
  }

  // 连续 5 次相同工具调用 = 检测到循环
  if (this.toolCallRepetitionCount >= TOOL_CALL_LOOP_THRESHOLD) {
    return true;  // 循环检测到
  }
  return false;
}
```

**工具调用键生成：**

```typescript
private getToolCallKey(toolCall: { name: string; args: object }): string {
  const argsString = JSON.stringify(toolCall.args);
  const keyString = `${toolCall.name}:${argsString}`;
  return createHash('sha256').update(keyString).digest('hex');
}
```

**示例场景：**

```
第 1 轮: read_file(path="/test.txt") ✅
第 2 轮: read_file(path="/test.txt") ✅
第 3 轮: read_file(path="/test.txt") ✅
第 4 轮: read_file(path="/test.txt") ✅
第 5 轮: read_file(path="/test.txt") ✅
          ↓ 检测到循环！terminateMode = ERROR
```

### Session-Level 禁用功能

在某些情况下，用户可能需要**临时禁用循环检测**：

```typescript
class LoopDetectionService {
  private disabledForSession = false;

  disableForSession(): void {
    this.disabledForSession = true;
    // 记录遥测事件
    logLoopDetectionDisabled(
      this.config,
      new LoopDetectionDisabledEvent(this.promptId),
    );
  }
}
```

**使用场景：**

- 已知某些代码模式会被误判为循环
- 需要长时间运行的合法重复操作
- 调试或测试期间

**调用方式：**

```typescript
// 在主客户端中调用
loopDetector.disableForSession();
```

第 1 轮: read_file(path="/test.txt") ✅
第 2 轮: read_file(path="/test.txt") ✅
第 3 轮: read_file(path="/test.txt") ✅
第 4 轮: read_file(path="/test.txt") ✅
第 5 轮: read_file(path="/test.txt") ✅
↓ 检测到循环！terminateMode = ERROR

````

#### 2. 内容循环检测（Content Chanting）

**检测算法：滑动窗口 + 哈希**

```typescript
private analyzeContentChunksForLoop(): boolean {
  while (this.hasMoreChunksToProcess()) {
    // 1. 提取 50 字符的固定块
    const currentChunk = this.streamContentHistory.substring(
      this.lastContentIndex,
      this.lastContentIndex + CONTENT_CHUNK_SIZE,
    );

    // 2. 计算块的 SHA-256 哈希
    const chunkHash = createHash('sha256').update(currentChunk).digest('hex');

    // 3. 检查是否为循环
    if (this.isLoopDetectedForChunk(currentChunk, chunkHash)) {
      return true;
    }

    // 4. 移动到下一个位置
    this.lastContentIndex++;
  }

  return false;
}
````

**循环判定逻辑：**

```typescript
private isLoopDetectedForChunk(chunk: string, hash: string): boolean {
  const existingIndices = this.contentStats.get(hash);

  if (!existingIndices) {
    this.contentStats.set(hash, [this.lastContentIndex]);
    return false;
  }

  // 验证实际内容匹配（防止哈希冲突）
  if (!this.isActualContentMatch(chunk, existingIndices[0])) {
    return false;
  }

  existingIndices.push(this.lastContentIndex);

  // 10 次重复且距离接近 = 检测到循环
  if (existingIndices.length < CONTENT_LOOP_THRESHOLD) {
    return false;
  }

  const recentIndices = existingIndices.slice(-CONTENT_LOOP_THRESHOLD);
  const totalDistance = recentIndices[recentIndices.length - 1] - recentIndices[0];
  const averageDistance = totalDistance / (CONTENT_LOOP_THRESHOLD - 1);
  const maxAllowedDistance = CONTENT_CHUNK_SIZE * 1.5;  // 75 字符内

  return averageDistance <= maxAllowedDistance;
}
```

**智能避免误报：**

循环检测会在以下情况下**禁用**或重置，以避免误报：

````typescript
private checkContentLoop(content: string): boolean {
  // 1. 代码块内禁用检测
  const numFences = (content.match(/```/g) ?? []).length;
  const wasInCodeBlock = this.inCodeBlock;
  this.inCodeBlock = numFences % 2 === 0 ? !this.inCodeBlock : this.inCodeBlock;

  if (wasInCodeBlock || this.inCodeBlock) {
    return false;  // 代码块不检测
  }

  // 2. 不同内容元素重置跟踪
  const hasTable = /(^|\n)\s*(\|.*\||[|+-]{3,})/.test(content);
  const hasListItem = /(^|\n)\s*[*-+]\s/.test(content);
  const hasHeading = /(^|\n)#+\s/.test(content);
  const hasBlockquote = /(^|\n)>\s/.test(content);
  const isDivider = /^[+-=_*\u2500-\u257F]+$/.test(content);

  if (hasTable || hasListItem || hasHeading || hasBlockquote || isDivider) {
    this.resetContentTracking();  // 重置历史
    return false;
  }

  // 3. 正常检测
  this.streamContentHistory += content;
  this.truncateAndUpdate();  // 限制历史长度
  return this.analyzeContentChunksForLoop();
}
````

**为什么这样设计？**

- 代码块经常有重复语法（如 `function name() {`），不是循环
- 列表项（`- item`）可能有重复格式，不是循环
- 表格、标题、引用等结构化内容可能有重复模式，不是循环

**历史截断：**

```typescript
private truncateAndUpdate(): void {
  if (this.streamContentHistory.length <= MAX_HISTORY_LENGTH) {  // 1000 字符
    return;
  }

  const truncationAmount = this.streamContentHistory.length - MAX_HISTORY_LENGTH;
  this.streamContentHistory = this.streamContentHistory.slice(truncationAmount);

  // 调整所有存储的索引
  for (const [hash, oldIndices] of this.contentStats.entries()) {
    const adjustedIndices = oldIndices
      .map((index) => index - truncationAmount)
      .filter((index) => index >= 0);

    if (adjustedIndices.length > 0) {
      this.contentStats.set(hash, adjustedIndices);
    } else {
      this.contentStats.delete(hash);
    }
  }
}
```

### 第三层：AbortSignal 控制

```typescript
async runNonInteractive(
  context: ContextState,
  externalSignal?: AbortSignal,
): Promise<void> {
  let currentRoundAbortController: AbortController | null = null;

  const onExternalAbort = () => {
    currentRoundAbortController?.abort();  // 立即中断当前轮次
  };

  if (externalSignal) {
    externalSignal.addEventListener('abort', onExternalAbort);
  }

  try {
    while (true) {
      // 每轮创建新的 AbortController
      const roundAbortController = new AbortController();
      currentRoundAbortController = roundAbortController;

      if (externalSignal?.aborted) {
        roundAbortController.abort();
      }

      const responseStream = await chat.sendMessageStream({
        abortSignal: roundAbortController.signal,  // 传播中断信号
        // ...
      });

      for await (const streamEvent of responseStream) {
        if (roundAbortController.signal.aborted) {
          this.terminateMode = SubagentTerminateMode.CANCELLED;
          return;
        }
        // 处理流式事件...
      }
    }
  } finally {
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}
```

### 终止模式完整列表

```typescript
enum SubagentTerminateMode {
  ERROR = 'ERROR', // 不可恢复的错误
  TIMEOUT = 'TIMEOUT', // 超过最大执行时间
  GOAL = 'GOAL', // 成功完成任务
  MAX_TURNS = 'MAX_TURNS', // 超过最大轮次
  CANCELLED = 'CANCELLED', // 用户或系统取消
}
```

---

## 完整的执行流程

### 流程图

```
[开始]
   ↓
1. createChatObject(context)
   - 验证提示词配置
   - 构建系统提示词（模板化 + 规则 + 用户记忆）
   - 初始化 GeminiChat
   ↓
2. 初始化执行状态
   - 设置 turnCounter = 0
   - 记录 startTime
   - 发送 START 事件
   ↓
3. [进入执行循环 while(true)]
   ↓
4. 创建 roundAbortController
   ↓
5. 检查终止条件
   - max_turns reached? → MAX_TURNS
   - max_time_minutes reached? → TIMEOUT
   - externalSignal aborted? → CANCELLED
   - loop detected? → ERROR
   ↓
6. 调用 LLM (sendMessageStream)
   ↓
7. 流式处理响应
   - STREAM_TEXT: 更新 UI
   - TOOL_CALL: 收集 functionCalls
   - USAGE_METADATA: 更新统计
   ↓
8. LoopDetectionService.addAndCheck(event)
   - 检测工具调用循环（5 次重复）
   - 检测内容循环（10 次重复）
   ↓
9. 处理工具调用（如果有）
   - executeToolCall(...)
   - 记录统计
   - 更新 currentMessages
   ↓
10. 判断任务完成
    - 有工具调用？→ 继续循环
    - 有文本且无工具调用？→ GOAL，退出循环
    - 都没有？→ 提示模型提供最终答案
   ↓
11. 发送 ROUND_END 事件
   - turnCounter++
   ↓
[回到步骤 3]
   ↓
[循环退出]
   ↓
12. 发送 FINISH 事件
   - terminateReason
   - 统计摘要
   ↓
13. 调用 hooks.onStop()
   ↓
14. 记录遥测数据
   ↓
[结束]
```

### 关键代码路径

**子代理创建：**

```typescript
// SubagentManager.createSubagentScope()
const subagentScope = new SubAgentScope(
  runtimeContext,
  {
    promptConfig,
    modelConfig,
    runConfig,
    toolConfig,
  },
  eventEmitter,
  hooks,
);
```

**任务执行：**

```typescript
// TaskToolInvocation.execute()
const subagentScope = await this.subagentManager.createSubagentScope(
  subagentConfig,
  this.config,
  { eventEmitter: this.eventEmitter },
);

const contextState = new ContextState();
contextState.set('task_prompt', this.params.prompt);

await subagentScope.runNonInteractive(contextState, signal);
```

---

## 性能统计与监控

### SubagentStatistics 类

**跟踪的指标：**

```typescript
class SubagentStatistics {
  private rounds = 0;
  private totalToolCalls = 0;
  private successfulToolCalls = 0;
  private failedToolCalls = 0;
  private inputTokens = 0;
  private outputTokens = 0;
  private thoughtTokens = 0;
  private cachedTokens = 0;
  private toolUsage = new Map<string, ToolUsageStats>();
}
```

**每工具统计：**

```typescript
interface ToolUsageStats {
  name: string;
  count: number; // 调用次数
  success: number; // 成功次数
  failure: number; // 失败次数
  lastError?: string; // 最后一次错误
  totalDurationMs: number; // 总耗时
  averageDurationMs: number; // 平均耗时
}
```

### 性能摘要生成

```typescript
getSummary(now = Date.now()): SubagentStatsSummary {
  const totalDurationMs = now - this.startTimeMs;
  const successRate =
    totalToolCalls > 0
      ? (this.successfulToolCalls / totalToolCalls) * 100
      : 0;
  const totalTokens = inputTokens + outputTokens + thoughtTokens + cachedTokens;
  const estimatedCost = inputTokens * 3e-5 + outputTokens * 6e-5;

  return {
    rounds: this.rounds,
    totalDurationMs,
    totalToolCalls,
    successfulToolCalls,
    failedToolCalls,
    successRate,
    inputTokens,
    outputTokens,
    thoughtTokens,
    cachedTokens,
    totalTokens,
    estimatedCost,
    toolUsage: Array.from(this.toolUsage.values()),
  };
}
```

### 性能提示生成

```typescript
private generatePerformanceTips(stats: SubagentStatsSummary): string[] {
  const tips: string[] = [];

  // 1. 高失败率
  if (stats.successRate < 80) {
    tips.push('Low tool success rate - review inputs and error messages');
  }

  // 2. 长执行时间
  if (stats.totalDurationMs > 60_000) {
    tips.push('Long execution time - consider breaking down complex tasks');
  }

  // 3. 高 token 使用
  if (stats.totalTokens > 100_000) {
    tips.push('High token usage - consider optimizing prompts or narrowing scope');
  }

  // 4. 高平均 token / 工具调用
  const avgTokPerCall = stats.totalTokens / stats.totalToolCalls;
  if (avgTokPerCall > 5_000) {
    tips.push(`High token usage per tool call (~${Math.round(avgTokPerCall)} tokens/call)`);
  }

  // 5. 网络工具失败
  const hadNetworkFailure = stats.toolUsage?.some(
    (t) => /web|fetch|search/i.test(t.name) &&
             t.lastError && /timeout|network/i.test(t.lastError),
  );
  if (hadNetworkFailure) {
    tips.push('Network operations had failures - consider increasing timeout');
  }

  // 6. 慢工具
  const slow = stats.toolUsage?.filter(
    (t) => (t.averageDurationMs ?? 0) > 10_000
  );
  if (slow.length > 0) {
    tips.push(`Consider optimizing ${slow[0].name} operations`);
  }

  return tips;
}
```

### 遥测集成

```typescript
// 执行完成后记录遥测
const completionEvent = new SubagentExecutionEvent(
  this.name,
  this.terminateMode === SubagentTerminateMode.GOAL ? 'completed' : 'failed',
  {
    terminate_reason: this.terminateMode,
    result: this.finalText,
    execution_summary: this.stats.formatCompact('Subagent execution completed'),
  },
);

logSubagentExecution(this.runtimeContext, completionEvent);
```

---

## 最佳实践

### 配置子代理

**1. 设置合理的限制：**

```typescript
const runConfig = {
  max_turns: 50, // 适合大多数任务
  max_time_minutes: 15, // 15 分钟限制
};
```

**2. 选择合适的工具集：**

```typescript
const toolConfig = {
  tools: ['read', 'grep', 'glob', 'edit'], // 只允许必要工具
};
```

**3. 编写清晰的提示词：**

```typescript
const systemPrompt = `
You are a ${role} agent.

Task: ${task_description}

Constraints:
- ${constraint_1}
- ${constraint_2}

Output format:
${output_format}
`;
```

### 调试循环问题

**1. 检查 LoopDetectionEvent 遥测：**

```typescript
eventEmitter.on(SubAgentEventType.ERROR, (event) => {
  if (event.error.includes('Loop detected')) {
    console.log('Loop detected:', event);
  }
});
```

**2. 查看统计摘要：**

```typescript
const summary = stats.formatDetailed(taskDesc);
console.log(summary);
// 输出：
// 📋 Task Completed: task_desc
// ⏱️ Duration: 2m 30s | 🔁 Rounds: 15
// ✅ Quality: Excellent execution (95.5% tool success)
// 🚀 Speed: Good speed - under a minute
// 🔧 Tools: 20 calls, 95.5% success (19 ok, 1 failed)
// 🔢 Tokens: 45,234 (in 32,156, out 13,078)
//
// 💡 Performance Insights:
//  - Low tool success rate - review inputs and error messages
```

**3. 分析失败的工具调用：**

```typescript
const toolStats = stats.toolUsage.find((t) => t.name === 'grep');
if (toolStats?.lastError) {
  console.error(`Last grep error: ${toolStats.lastError}`);
}
```

---

## 总结

Qwen Code 的 Task 系统采用**多层防护**来确保安全和高效：

1. **硬限制**：max_turns 和 max_time_minutes
2. **智能检测**：LoopDetectionService 检测工具调用和内容循环
3. **实时监控**：事件发射器提供完整的进度可见性
4. **性能洞察**：SubagentStatistics 提供详细的分析和建议
5. **可控执行**：AbortSignal 允随时取消任务

这些机制协同工作，确保子代理既能高效完成任务，又不会陷入无限循环或消耗过多资源。

---

## Hooks 系统

Subagent 提供**生命周期钩子**，允许扩展和自定义行为：

### 可用钩子

```typescript
interface SubagentHooks {
  preToolUse?(payload: {
    subagentId: string;
    toolName: string;
    args: Record<string, unknown>;
  }): void;

  postToolUse?(payload: {
    subagentId: string;
    toolName: string;
    success: boolean;
    result?: ToolResult;
    error?: string;
    durationMs?: number;
  }): void;

  onStop?(payload: {
    subagentId: string;
    name: string;
    terminateReason: SubagentTerminateMode;
    summary: Record<string, unknown>;
    timestamp: number;
  }): void;
}
```

### Hook 使用场景

**1. 自定义日志记录：**

```typescript
const hooks: SubagentHooks = {
  preToolUse: (payload) => {
    console.log(`[HOOK] Tool ${payload.toolName} called with:`, payload.args);
  },
  postToolUse: (payload) => {
    console.log(
      `[HOOK] Tool ${payload.toolName} ${payload.success ? 'succeeded' : 'failed'}`,
    );
  },
};
```

**2. 自定义遥测：**

```typescript
const hooks: SubagentHooks = {
  onStop: (payload) => {
    // 发送自定义遥测事件
    sendCustomTelemetry({
      subagentName: payload.name,
      duration: payload.summary.totalDurationMs,
      success: payload.terminateReason === 'GOAL',
    });
  },
};
```

**3. 工具使用拦截/验证：**

```typescript
const hooks: SubagentHooks = {
  preToolUse: (payload) => {
    // 验证或修改工具调用
    if (payload.toolName === 'shell' && isDangerousCommand(payload.args)) {
      throw new Error('Dangerous command blocked by hook');
    }
  },
};
```

---

## 扩展集成

### 扩展提供子代理

扩展可以**提供自定义子代理**，优先级高于内置代理：

```typescript
// 扩展定义的子代理
{
  name: 'my-custom-agent',
  description: 'Custom agent from my extension',
  level: 'extension',  // 扩展级别
  systemPrompt: '...',
  tools: ['read', 'grep', 'edit'],
  extensionName: 'my-extension',
}
```

### 扩展提供自定义工具

扩展可以**提供自定义工具**给子代理使用：

```typescript
// 在扩展中注册工具
toolRegistry.registerTool(new CustomTool());

// 子代理可以访问
{
  tools: ['read', 'grep', 'custom-tool-from-extension'],
}
```

### 管理命令

用户可以通过 CLI 管理子代理：

```bash
# 查看所有可用代理
/agents list

# 创建新代理（交互式向导）
/agents create

# 编辑现有代理
/agents edit <name>

# 删除代理
/agents delete <name>

# 查看代理详情
/agents show <name>
```

---

## 常见问题与故障排查

### Q: 子代理没有输出任何结果？

**A:** 可能原因：

1. 任务描述太模糊
2. 工具权限不足
3. 提示词太严格，限制了行为
4. 遇到循环检测

**解决方法：**

- 检查 `subagentStats.getFinalText()` 是否为空
- 查看 `terminateReason` 了解失败原因
- 增加工具权限
- 放宽提示词约束

### Q: 子代理执行时间过长？

**A:** 可能原因：

1. 未设置合理的 `max_time_minutes`
2. 任务范围太大
3. 工具调用效率低

**解决方法：**

```yaml
runConfig:
  max_time_minutes: 30 # 设置合理的上限
```

### Q: 如何防止内容循环误报？

**A:** LoopDetectionService 会自动处理：

- 代码块内不检测循环
- 列表、表格、标题等结构化内容会重置检测
- 可以通过 `loopDetector.disableForSession()` 临时禁用

### Q: 如何查看子代理的详细执行日志？

**A:** 通过事件监听器获取：

```typescript
const events: SubAgentEventType[] = [];

eventEmitter.on(SubAgentEventType.TOOL_CALL, (event) => {
  events.push(event);
});

eventEmitter.on(SubAgentEventType.TOOL_RESULT, (event) => {
  events.push(event);
});

// 最终获取所有事件
const allEvents = events;
```

---

## 性能优化建议

### 1. 合理设置限制

```yaml
runConfig:
  max_time_minutes: 20 # 适合大多数任务
  max_turns: 40 # 减少不必要的轮次
```

### 2. 限制工具权限

只给子代理必要的工具，避免无关工具调用：

```yaml
tools:
  - read
  - grep
  - edit
  # 不包括：shell, web-search 等
```

### 3. 编写高效的提示词

- 明确指定任务范围
- 提供清晰的成功标准
- 避免过于开放式的指令

### 4. 利用统计信息

定期查看 `SubagentStatistics` 提供的洞察：

- 工具成功率
- 平均执行时间
- Token 使用情况
- 性能提示

---

## 参考资料

- **源码位置：**
  - `/packages/core/src/subagents/subagent.ts` - 核心执行引擎
  - `/packages/core/src/subagents/subagent-manager.ts` - 配置管理
  - `/packages/core/src/subagents/types.ts` - 类型定义
  - `/packages/core/src/services/loopDetectionService.ts` - 循环检测服务
  - `/packages/core/src/subagents/subagent-statistics.ts` - 统计追踪
  - `/packages/core/src/tools/task.ts` - Task 工具入口
  - `/packages/core/src/subagents/builtin-agents.ts` - 内置代理注册表
  - `/packages/core/src/subagents/subagent-hooks.ts` - 生命周期钩子
  - `/packages/core/src/subagents/subagent-events.ts` - 事件系统

- **相关文档：**
  - [任务管理工具对比](../tools/task-management-zh.md)
  - [工具开发文档](../tools/introduction.md)
  - [子代理功能说明](../../users/features/sub-agents.md)

---

**文档版本：** 1.0.0
**最后更新：** 2026-03-13
**维护者：** Qwen Code Team
