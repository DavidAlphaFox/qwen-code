/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 终端平台常量
 * 此文件包含整个应用程序中使用的终端相关常量，专门用于处理键盘输入和终端协议
 */

/**
 * Kitty 键盘协议的增强键盘输入序列
 * @see https://sw.kovidgoyal.net/kitty/keyboard-protocol/
 */
export const KITTY_CTRL_C = '[99;5u';

/**
 * Kitty 键盘协议按键码
 */
export const KITTY_KEYCODE_ENTER = 13;
export const KITTY_KEYCODE_NUMPAD_ENTER = 57414;
export const KITTY_KEYCODE_TAB = 9;
export const KITTY_KEYCODE_BACKSPACE = 127;

/**
 * Kitty 修饰键解码常量
 * 在 Kitty/Ghostty 中，修饰键参数编码为 (1 + bitmask)
 * 某些终端在报告事件类型时还设置第 7 位（即添加 128）
 */
export const KITTY_MODIFIER_BASE = 1; // 解码前的基础值
export const KITTY_MODIFIER_EVENT_TYPES_OFFSET = 128; // 包含事件类型时添加

/**
 * Kitty/Xterm 风格参数的修饰键位标志
 * 规范中修饰键参数编码为 (1 + bitmask)：
 * - 1: 无修饰键
 * - 位 0 (1): Shift
 * - 位 1 (2): Alt/Option（在规范中报告为 "alt"，我们映射到 meta）
 * - 位 2 (4): Ctrl
 * 某些终端在报告事件类型时向整个修饰键字段添加 128
 * @see https://sw.kovidgoyal.net/kitty/keyboard-protocol/#modifiers
 */
export const MODIFIER_SHIFT_BIT = 1;
export const MODIFIER_ALT_BIT = 2;
export const MODIFIER_CTRL_BIT = 4;

/**
 * 终端交互的时序常量
 */
export const CTRL_EXIT_PROMPT_DURATION_MS = 1000;

/**
 * VS Code 终端集成常量
 */
export const VSCODE_SHIFT_ENTER_SEQUENCE = '\\\r\n';

/**
 * 反斜杠+回车检测窗口（毫秒）
 * 用于检测反斜杠后跟回车的 Shift+Enter 模式
 */
export const BACKSLASH_ENTER_DETECTION_WINDOW_MS = 5;

/**
 * Kitty 键盘协议序列的最大预期长度
 * 格式：ESC [ <keycode> ; <modifiers> u/~
 * 示例：\x1b[13;2u (Shift+Enter) = 8 个字符
 * 最长合理：\x1b[127;15~ = 11 个字符（带所有修饰键的 Del）
 * 我们使用 32 提供一个小缓冲区
 */
// 增加以适应参数化形式和偶尔的冒号子字段
// 同时仍然足够小以避免病态缓冲
export const MAX_KITTY_SEQUENCE_LENGTH = 32;

/**
 * 常见转义序列的字符代码
 */
export const CHAR_CODE_ESC = 27;
export const CHAR_CODE_LEFT_BRACKET = 91;
export const CHAR_CODE_1 = 49;
export const CHAR_CODE_2 = 50;
