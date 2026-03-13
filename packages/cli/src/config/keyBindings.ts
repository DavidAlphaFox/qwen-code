/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 所有可用键盘快捷键的命令枚举
 */
export enum Command {
  // Basic bindings
  RETURN = 'return',
  ESCAPE = 'escape',

  // Cursor movement
  HOME = 'home',
  END = 'end',

  // Text deletion
  KILL_LINE_RIGHT = 'killLineRight',
  KILL_LINE_LEFT = 'killLineLeft',
  CLEAR_INPUT = 'clearInput',
  DELETE_WORD_BACKWARD = 'deleteWordBackward',

  // Screen control
  CLEAR_SCREEN = 'clearScreen',

  // History navigation
  HISTORY_UP = 'historyUp',
  HISTORY_DOWN = 'historyDown',
  NAVIGATION_UP = 'navigationUp',
  NAVIGATION_DOWN = 'navigationDown',

  // Auto-completion
  ACCEPT_SUGGESTION = 'acceptSuggestion',
  COMPLETION_UP = 'completionUp',
  COMPLETION_DOWN = 'completionDown',

  // Text input
  SUBMIT = 'submit',
  NEWLINE = 'newline',

  // External tools
  OPEN_EXTERNAL_EDITOR = 'openExternalEditor',
  PASTE_CLIPBOARD_IMAGE = 'pasteClipboardImage',

  // App level bindings
  TOGGLE_TOOL_DESCRIPTIONS = 'toggleToolDescriptions',
  TOGGLE_IDE_CONTEXT_DETAIL = 'toggleIDEContextDetail',
  QUIT = 'quit',
  EXIT = 'exit',
  SHOW_MORE_LINES = 'showMoreLines',
  RETRY_LAST = 'retryLast',

  // Shell commands
  REVERSE_SEARCH = 'reverseSearch',
  SUBMIT_REVERSE_SEARCH = 'submitReverseSearch',
  ACCEPT_SUGGESTION_REVERSE_SEARCH = 'acceptSuggestionReverseSearch',
  TOGGLE_SHELL_INPUT_FOCUS = 'toggleShellInputFocus',

  // Suggestion expansion
  EXPAND_SUGGESTION = 'expandSuggestion',
  COLLAPSE_SUGGESTION = 'collapseSuggestion',
}

/**
 * 用于用户配置的按键绑定结构
 */
export interface KeyBinding {
  /** 键名（例如 'a', 'return', 'tab', 'escape'） */
  key?: string;
  /** 键序列（例如 '\x18' 表示 Ctrl+X）- 作为键名的替代方案 */
  sequence?: string;
  /** Control 键要求：true=必须按下，false=必须不按下，undefined=忽略 */
  ctrl?: boolean;
  /** Shift 键要求：true=必须按下，false=必须不按下，undefined=忽略 */
  shift?: boolean;
  /** Command/Meta 键要求：true=必须按下，false=必须不按下，undefined=忽略 */
  command?: boolean;
  /** 粘贴操作要求：true=必须是粘贴，false=必须不是粘贴，undefined=忽略 */
  paste?: boolean;
  meta?: boolean;
}

/**
 * 配置类型，将命令映射到其按键绑定
 */
export type KeyBindingConfig = {
  readonly [C in Command]: readonly KeyBinding[];
};

/**
 * 默认按键绑定配置
 * 与原始硬编码逻辑完全匹配
 */
export const defaultKeyBindings: KeyBindingConfig = {
  // Basic bindings
  [Command.RETURN]: [{ key: 'return' }],
  [Command.ESCAPE]: [{ key: 'escape' }],

  // Cursor movement
  [Command.HOME]: [{ key: 'a', ctrl: true }],
  [Command.END]: [{ key: 'e', ctrl: true }],

  // Text deletion
  [Command.KILL_LINE_RIGHT]: [{ key: 'k', ctrl: true }],
  [Command.KILL_LINE_LEFT]: [{ key: 'u', ctrl: true }],
  [Command.CLEAR_INPUT]: [{ key: 'c', ctrl: true }],
  // Added command (meta/alt/option) for mac compatibility
  [Command.DELETE_WORD_BACKWARD]: [
    { key: 'backspace', ctrl: true },
    { key: 'backspace', command: true },
  ],

  // Screen control
  [Command.CLEAR_SCREEN]: [{ key: 'l', ctrl: true }],

  // History navigation
  [Command.HISTORY_UP]: [{ key: 'p', ctrl: true }],
  [Command.HISTORY_DOWN]: [{ key: 'n', ctrl: true }],
  [Command.NAVIGATION_UP]: [{ key: 'up' }],
  [Command.NAVIGATION_DOWN]: [{ key: 'down' }],

  // Auto-completion
  [Command.ACCEPT_SUGGESTION]: [{ key: 'tab' }, { key: 'return', ctrl: false }],
  // Completion navigation uses only arrow keys
  // Ctrl+P/N are reserved for history navigation (HISTORY_UP/DOWN)
  [Command.COMPLETION_UP]: [{ key: 'up' }],
  [Command.COMPLETION_DOWN]: [{ key: 'down' }],

  // Text input
  // Must also exclude shift to allow shift+enter for newline
  [Command.SUBMIT]: [
    {
      key: 'return',
      ctrl: false,
      command: false,
      paste: false,
      shift: false,
    },
  ],
  // Split into multiple data-driven bindings
  // Now also includes shift+enter for multi-line input
  [Command.NEWLINE]: [
    { key: 'return', ctrl: true },
    { key: 'return', command: true },
    { key: 'return', paste: true },
    { key: 'return', shift: true },
    { key: 'j', ctrl: true },
  ],

  // External tools
  [Command.OPEN_EXTERNAL_EDITOR]: [
    { key: 'x', ctrl: true },
    { sequence: '\x18', ctrl: true },
  ],
  [Command.PASTE_CLIPBOARD_IMAGE]:
    process.platform === 'win32'
      ? [
          { key: 'v', command: true },
          { key: 'v', meta: true },
        ]
      : [
          { key: 'v', ctrl: true },
          { key: 'v', command: true },
        ],

  // App level bindings
  [Command.TOGGLE_TOOL_DESCRIPTIONS]: [{ key: 't', ctrl: true }],
  [Command.TOGGLE_IDE_CONTEXT_DETAIL]: [{ key: 'g', ctrl: true }],
  [Command.QUIT]: [{ key: 'c', ctrl: true }],
  [Command.EXIT]: [{ key: 'd', ctrl: true }],
  [Command.SHOW_MORE_LINES]: [{ key: 's', ctrl: true }],
  [Command.RETRY_LAST]: [{ key: 'y', ctrl: true }],

  // Shell commands
  [Command.REVERSE_SEARCH]: [{ key: 'r', ctrl: true }],
  // Note: original logic ONLY checked ctrl=false, ignored meta/shift/paste
  [Command.SUBMIT_REVERSE_SEARCH]: [{ key: 'return', ctrl: false }],
  [Command.ACCEPT_SUGGESTION_REVERSE_SEARCH]: [{ key: 'tab' }],
  [Command.TOGGLE_SHELL_INPUT_FOCUS]: [{ key: 'f', ctrl: true }],

  // Suggestion expansion
  [Command.EXPAND_SUGGESTION]: [{ key: 'right' }],
  [Command.COLLAPSE_SUGGESTION]: [{ key: 'left' }],
};
