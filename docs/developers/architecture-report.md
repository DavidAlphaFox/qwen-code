# Qwen Code 项目分析报告

## 项目概述

Qwen Code 是一个开源的 AI 终端代理，专注于为 Qwen3-Coder 模型优化。它帮助开发者理解大型代码库、自动化繁琐工作，并加速开发流程。

**项目地址**: https://github.com/QwenLM/qwen-code
**版本**: 0.12.2

---

## 1. 项目架构 (Monorepo)

### 1.1 包结构

| 包名                     | 名称                            | 用途                      | 入口点                        |
| ------------------------ | ------------------------------- | ------------------------- | ----------------------------- |
| **cli**                  | @qwen-code/qwen-code            | 终端CLI主程序             | `dist/index.js` (bin: `qwen`) |
| **core**                 | @qwen-code/qwen-code-core       | 核心AI逻辑、工具、MCP集成 | `dist/index.js`               |
| **sdk-typescript**       | @qwen-code/sdk                  | TypeScript SDK            | `./dist/index.mjs`            |
| **webui**                | @qwen-code/webui                | React UI组件库            | `./dist/index.js`             |
| **web-templates**        | @qwen-code/web-templates        | Web模板                   | `dist/index.js`               |
| **vscode-ide-companion** | qwen-code-vscode-ide-companion  | VS Code扩展               | `./dist/extension.cjs`        |
| **test-utils**           | @qwen-code/qwen-code-test-utils | 测试工具(私有)            | `src/index.ts`                |

### 1.2 依赖关系

```
cli (主包)
├── @qwen-code/qwen-code-core (file:../core)
├── @qwen-code/web-templates (file:../web-templates)
└── @qwen-code/qwen-code-test-utils (file:../test-utils)

core
└── @qwen-code/qwen-code-test-utils (file:../test-utils)

vscode-ide-companion
├── @qwen-code/webui
├── @modelcontextprotocol/sdk
└── @agentclientprotocol/sdk
```

---

## 2. Tree-sitter 使用情况

### 2.1 结论

**项目未使用 tree-sitter**

项目使用 **LSP (Language Server Protocol)** 代替 tree-sitter 进行代码分析。

### 2.2 LSP相关文件

- `packages/core/src/lsp/types.ts` — LSP类型定义
- `packages/core/src/lsp/NativeLspService.ts` — LSP服务实现
- `packages/core/src/lsp/LspServerManager.ts` — LSP服务器管理
- `packages/core/src/lsp/LspLanguageDetector.ts` — 语言检测
- `packages/core/src/tools/lsp.ts` — LSP工具

### 2.3 自定义解析器 (非tree-sitter)

1. **GitIgnoreParser** (`packages/core/src/utils/gitIgnoreParser.ts`)
   - 解析 .gitignore 文件，使用 `ignore` npm 包

2. **QwenIgnoreParser** (`packages/core/src/utils/qwenIgnoreParser.ts`)
   - 解析 .qwenignore 文件

3. **StreamingToolCallParser** (`packages/core/src/core/openaiContentGenerator/streamingToolCallParser.ts`)
   - 解析LLM流式工具调用

---

## 3. 工具系统

### 3.1 核心架构

| 组件       | 文件路径                                          | 功能               |
| ---------- | ------------------------------------------------- | ------------------ |
| 工具定义   | `packages/core/src/tools/tools.ts`                | 工具接口和基类定义 |
| 工具注册   | `packages/core/src/config/config.ts` (L1820-1915) | 工具注册配置       |
| 工具执行   | `packages/core/src/core/coreToolScheduler.ts`     | 工具调度器         |
| 工具注册表 | `packages/core/src/tools/tool-registry.ts`        | 工具发现和注册     |

### 3.2 工具基类

```typescript
// 工具基类 - 所有工具都继承此类
DeclarativeTool<TParams, TResult>
  └── BaseDeclarativeTool<TParams, TResult> // 带JSON Schema验证

// 工具调用 - 封装具体执行逻辑
ToolInvocation<TParams, TResult>
```

### 3.3 工具分类 (Kind枚举)

```typescript
enum Kind {
  Read = 'read', // 读取
  Edit = 'edit', // 编辑
  Delete = 'delete', // 删除
  Move = 'move', // 移动
  Search = 'search', // 搜索
  Execute = 'execute', // 执行
  Think = 'think', // 思考
  Fetch = 'fetch', // 获取
  Other = 'other', // 其他
}
```

### 3.4 内置工具列表 (22个)

| 工具                | 文件                | 功能描述       |
| ------------------- | ------------------- | -------------- |
| TaskTool            | task.ts             | 执行子代理任务 |
| SkillTool           | skill.ts            | 加载执行skills |
| LSTool              | ls.ts               | 列出目录内容   |
| ReadFileTool        | read-file.ts        | 读取文件内容   |
| GrepTool            | grep.ts             | 文本搜索       |
| RipGrepTool         | ripGrep.ts          | RipGrep搜索    |
| GlobTool            | glob.ts             | 文件模式匹配   |
| EditTool            | edit.ts             | 编辑文件内容   |
| WriteFileTool       | write-file.ts       | 写入/创建文件  |
| ShellTool           | shell.ts            | 执行shell命令  |
| MemoryTool          | memoryTool.ts       | 存储/检索笔记  |
| TodoWriteTool       | todoWrite.ts        | 管理待办事项   |
| AskUserQuestionTool | askUserQuestion.ts  | 询问用户问题   |
| ExitPlanModeTool    | exitPlanMode.ts     | 退出计划模式   |
| WebFetchTool        | web-fetch.ts        | 获取网页内容   |
| WebSearchTool       | web-search/index.ts | 网页搜索       |
| DiffOptionsTool     | diffOptions.ts      | 差异选项       |
| ModifiableToolTool  | modifiable-tool.ts  | 可修改工具     |
| LspTool             | lsp.ts              | LSP语言服务器  |
| MCPTool             | mcp-tool.ts         | MCP工具封装    |

### 3.5 技能系统 (Skills)

- **位置**:
  - 项目级: `.qwen/skills/`
  - 用户级: `~/.qwen/skills/`
- **格式**: 包含 `SKILL.md` 文件的目录
- **实现文件**:
  - `packages/core/src/tools/skill.ts` — SkillTool类
  - `packages/core/src/skills/skill-manager.ts` — 技能管理器
  - `packages/core/src/skills/types.ts` — 技能类型定义

### 3.6 MCP集成

MCP (Model Context Protocol) 允许连接外部工具服务器。

**核心文件**:

- `packages/core/src/tools/mcp-client-manager.ts` — MCP服务器生命周期管理
- `packages/core/src/tools/mcp-client.ts` — MCP客户端连接
- `packages/core/src/tools/mcp-tool.ts` — MCP工具封装

**配置位置**: `settings.json` 中的 `mcpServers`

---

## 4. 核心模块

### 4.1 工具执行流程

```
LLM请求 → ToolCallRequestInfo → CoreToolScheduler.schedule()
  ↓
参数验证 (tool.build())
  ↓
确认检查 (invocation.shouldConfirmExecute())
  ↓
执行 (invocation.execute())
  ↓
返回ToolResult → 转换为FunctionResponse → 发送回LLM
```

### 4.2 配置系统

- `packages/core/src/config/config.ts` — 主配置文件
- `packages/core/src/config/types.ts` — 配置类型定义
- `packages/core/src/config/settings.ts` — 设置管理

---

## 5. CLI交互模块

### 5.1 命令行命令

位于 `packages/cli/src/commands/`:

- `auth.ts` — 认证命令
- `model.ts` — 模型切换
- `extensions/` — 扩展管理
- `help.ts` — 帮助信息

### 5.2 UI组件

位于 `packages/cli/src/ui/`:

- 交互式终端UI
- 聊天界面
- 工具确认对话框

---

## 6. 关键技术栈

### 6.1 核心依赖

- **AI SDK**: openai, @anthropic-ai/sdk, @google/genai
- **MCP**: @modelcontextprotocol/sdk
- **终端**: @xterm/xterm, ink (React终端UI)
- **文件处理**: glob, chokidar, ignore
- **代码分析**: LSP (通过lsp.ts工具)
- **测试**: vitest, msw

### 6.2 构建工具

- **打包**: esbuild
- **测试**: vitest
- **类型检查**: TypeScript

---

_本文档最后更新: 2026-03-12_
