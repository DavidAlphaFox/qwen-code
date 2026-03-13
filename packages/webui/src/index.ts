/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Qwen Code WebUI 组件库
 * @module @qwen-code/webui
 * @description 提供跨平台的React组件库，用于构建Qwen Code的UI界面
 */

// 引入样式文件
// eslint-disable-next-line import/no-internal-modules
import './styles/variables.css';
// eslint-disable-next-line import/no-internal-modules
import './styles/timeline.css';
// eslint-disable-next-line import/no-internal-modules
import './styles/components.css';

// ============ 上下文 (Context) ============

/**
 * 平台上下文 - 提供跨平台能力抽象
 * @see PlatformContext
 */
export {
  PlatformContext,
  PlatformProvider,
  usePlatform,
} from './context/PlatformContext';
export type {
  PlatformContextValue,
  PlatformProviderProps,
  PlatformType,
} from './context/PlatformContext';

// ============ 布局组件 (Layout Components) ============

/** 容器组件 */
export { default as Container } from './components/layout/Container';
/** 头部组件 */
export { default as Header } from './components/layout/Header';
/** 侧边栏组件 */
export { default as Sidebar } from './components/layout/Sidebar';
/** 主内容区组件 */
export { default as Main } from './components/layout/Main';
/** 底部组件 */
export { default as Footer } from './components/layout/Footer';
/** 文件链接组件 */
export { FileLink } from './components/layout/FileLink';
export type { FileLinkProps } from './components/layout/FileLink';
/** 聊天头部组件 */
export { ChatHeader } from './components/layout/ChatHeader';
export type { ChatHeaderProps } from './components/layout/ChatHeader';
/** 上下文指示器组件 */
export { ContextIndicator } from './components/layout/ContextIndicator';
export type {
  ContextIndicatorProps,
  ContextUsage,
} from './components/layout/ContextIndicator';
/** 自动补全菜单组件 */
export { CompletionMenu } from './components/layout/CompletionMenu';
export type { CompletionMenuProps } from './components/layout/CompletionMenu';
/** 会话选择器组件 */
export { SessionSelector } from './components/layout/SessionSelector';
export type { SessionSelectorProps } from './components/layout/SessionSelector';
/** 空状态组件 */
export { EmptyState } from './components/layout/EmptyState';
export type { EmptyStateProps } from './components/layout/EmptyState';
/** 输入表单组件 */
export { InputForm, getEditModeIcon } from './components/layout/InputForm';
export type {
  InputFormProps,
  EditModeInfo,
  EditModeIconType,
} from './components/layout/InputForm';
/** 引导页组件 */
export { Onboarding } from './components/layout/Onboarding';
export type { OnboardingProps } from './components/layout/Onboarding';

// ============ 消息组件 (Message Components) ============

/** 消息组件 */
export { default as Message } from './components/messages/Message';
/** 消息输入框组件 */
export { default as MessageInput } from './components/messages/MessageInput';
/** 消息列表组件 */
export { default as MessageList } from './components/messages/MessageList';
/** 等待消息组件 */
export { WaitingMessage } from './components/messages/Waiting/WaitingMessage';
/** 中断消息组件 */
export { InterruptedMessage } from './components/messages/Waiting/InterruptedMessage';
/** Markdown渲染器组件 */
export { MarkdownRenderer } from './components/messages/MarkdownRenderer/MarkdownRenderer';
export type { MarkdownRendererProps } from './components/messages/MarkdownRenderer/MarkdownRenderer';
/** 消息内容组件 */
export { MessageContent } from './components/messages/MessageContent';
export type { MessageContentProps } from './components/messages/MessageContent';
/** 用户消息组件 */
export { UserMessage } from './components/messages/UserMessage';
export type {
  UserMessageProps,
  FileContext,
} from './components/messages/UserMessage';
/** 思考消息组件 */
export { ThinkingMessage } from './components/messages/ThinkingMessage';
export type { ThinkingMessageProps } from './components/messages/ThinkingMessage';
/** 助手消息组件 */
export { AssistantMessage } from './components/messages/Assistant/AssistantMessage';
export type {
  AssistantMessageProps,
  AssistantMessageStatus,
} from './components/messages/Assistant/AssistantMessage';
/** 可折叠文件内容组件 */
export {
  CollapsibleFileContent,
  parseContentWithFileReferences,
} from './components/messages/CollapsibleFileContent';
export type {
  CollapsibleFileContentProps,
  ContentSegment,
} from './components/messages/CollapsibleFileContent';
/** 询问用户问题对话框组件 */
export { AskUserQuestionDialog } from './components/messages/AskUserQuestionDialog';
export type {
  AskUserQuestionDialogProps,
  Question,
  QuestionOption,
} from './components/messages/AskUserQuestionDialog';

// ============ 聊天查看器 (ChatViewer) ============

/**
 * 聊天查看器 - 独立的聊天显示组件
 * 用于在各种平台上显示聊天消息
 */
export {
  ChatViewer,
  default as ChatViewerDefault,
} from './components/ChatViewer';
export type {
  ChatViewerProps,
  ChatViewerHandle,
  ChatMessageData,
  ClaudeContentItem,
  MessagePart,
  ToolCallData as ChatViewerToolCallData,
} from './components/ChatViewer';

// ============ UI 元素 (UI Elements) ============

/** 按钮组件 */
export { default as Button } from './components/ui/Button';
/** 输入框组件 */
export { default as Input } from './components/ui/Input';
/** 提示框组件 */
export { Tooltip } from './components/ui/Tooltip';
export type { TooltipProps } from './components/ui/Tooltip';

// ============ 权限组件 (Permission Components) ============

/** 权限抽屉组件 */
export { PermissionDrawer } from './components/PermissionDrawer';
export type {
  PermissionDrawerProps,
  PermissionOption,
  PermissionToolCall,
} from './components/PermissionDrawer';

// ============ 工具调用组件 (ToolCall Components) ============

/**
 * 工具调用共享组件
 * @description 包含容器、卡片、行、状态指示器、代码块、位置列表等
 */
export {
  ToolCallContainer,
  ToolCallCard,
  ToolCallRow,
  StatusIndicator,
  CodeBlock,
  LocationsList,
  handleCopyToClipboard,
  CopyButton,
  // 工具函数
  extractCommandOutput,
  formatValue,
  safeTitle,
  shouldShowToolCall,
  groupContent,
  hasToolCallOutput,
  mapToolStatusToContainerStatus,
  // 业务工具调用组件
  ThinkToolCall,
  SaveMemoryToolCall,
  GenericToolCall,
  EditToolCall,
  WriteToolCall,
  SearchToolCall,
  UpdatedPlanToolCall,
  ShellToolCall,
  ReadToolCall,
  WebFetchToolCall,
  CheckboxDisplay,
} from './components/toolcalls';
export type {
  ToolCallContainerProps,
  ToolCallContent,
  ToolCallData,
  BaseToolCallProps,
  GroupedContent,
  ContainerStatus,
  PlanEntryStatus,
  CheckboxDisplayProps,
} from './components/toolcalls';

// ============ 图标 (Icons) ============

/** 图标组件 */
export { default as Icon } from './components/icons/Icon';
/** 关闭图标 */
export { default as CloseIcon } from './components/icons/CloseIcon';
/** 发送图标 */
export { default as SendIcon } from './components/icons/SendIcon';

// 文件图标
export {
  FileIcon,
  FileListIcon,
  SaveDocumentIcon,
  FolderIcon,
} from './components/icons/FileIcons';

// 状态图标
export {
  PlanCompletedIcon,
  PlanInProgressIcon,
  PlanPendingIcon,
  WarningTriangleIcon,
  UserIcon,
  SymbolIcon,
  SelectionIcon,
} from './components/icons/StatusIcons';

// 导航图标
export {
  ChevronDownIcon,
  PlusIcon,
  PlusSmallIcon,
  ArrowUpIcon,
  CloseIcon as CloseXIcon,
  CloseSmallIcon,
  SearchIcon,
  RefreshIcon,
} from './components/icons/NavigationIcons';

// 编辑图标
export {
  EditPencilIcon,
  AutoEditIcon,
  PlanModeIcon,
  CodeBracketsIcon,
  HideContextIcon,
  SlashCommandIcon,
  LinkIcon,
  OpenDiffIcon,
  UndoIcon,
} from './components/icons/EditIcons';

// 特殊图标
export { ThinkingIcon, TerminalIcon } from './components/icons/SpecialIcons';

// 停止图标
export { StopIcon } from './components/icons/StopIcon';

// ============ 自定义 Hooks ============

/** 主题管理 Hook */
export { useTheme } from './hooks/useTheme';
/** 本地存储 Hook */
export { useLocalStorage } from './hooks/useLocalStorage';

// ============ 类型定义 (Types) ============

/** 主题类型 */
export type { Theme } from './types/theme';
/** 消息属性 */
export type { MessageProps } from './types/messages';
/** 聊天消息、角色、计划条目 */
export type { ChatMessage, MessageRole, PlanEntry } from './types/chat';
// ToolCallStatus 和 ToolCallLocation 已从 './components/toolcalls' 导出
export type { ToolCallContentItem, ToolCallUpdate } from './types/toolCall';
// 为向后兼容重新导出 ToolCallStatus 和 ToolCallLocation
export type { ToolCallStatus, ToolCallLocation } from './components/toolcalls';
/** 自动补全项 */
export type { CompletionItem, CompletionItemType } from './types/completion';

// ============ 工具函数 (Utils) ============

/** 会话分组工具函数 */
export { groupSessionsByDate, getTimeAgo } from './utils/sessionGrouping';
export type { SessionGroup } from './utils/sessionGrouping';

// ============ 适配器 (Adapters) ============

/**
 * 适配器 - 用于规范化不同数据格式
 * @description 将不同格式的消息转换为统一格式
 */
export {
  adaptJSONLMessages,
  adaptACPMessages,
  filterEmptyMessages,
  isToolCallData,
  isMessageData,
} from './adapters';
export type {
  UnifiedMessage,
  UnifiedMessageType,
  JSONLMessage,
  ACPMessage,
  ACPMessageData,
} from './adapters';

// ============ VSCode Webview 工具 ============

/** Webview容器组件 */
export { default as WebviewContainer } from './components/WebviewContainer';
