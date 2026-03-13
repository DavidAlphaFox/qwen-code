/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Key } from './hooks/useKeypress.js';
import type { KeyBinding, KeyBindingConfig } from '../config/keyBindings.js';
import { Command, defaultKeyBindings } from '../config/keyBindings.js';

/**
 * 将 KeyBinding 与实际按键进行匹配
 * 纯数据驱动的匹配逻辑
 */
function matchKeyBinding(keyBinding: KeyBinding, key: Key): boolean {
  // Either key name or sequence must match (but not both should be defined)
  let keyMatches = false;

  if (keyBinding.key !== undefined) {
    keyMatches = keyBinding.key === key.name;
  } else if (keyBinding.sequence !== undefined) {
    keyMatches = keyBinding.sequence === key.sequence;
  } else {
    // Neither key nor sequence defined - invalid binding
    return false;
  }

  if (!keyMatches) {
    return false;
  }

  // Check modifiers - follow original logic:
  // undefined = ignore this modifier (original behavior)
  // true = modifier must be pressed
  // false = modifier must NOT be pressed

  if (keyBinding.ctrl !== undefined && key.ctrl !== keyBinding.ctrl) {
    return false;
  }

  if (keyBinding.shift !== undefined && key.shift !== keyBinding.shift) {
    return false;
  }

  if (keyBinding.command !== undefined && key.meta !== keyBinding.command) {
    return false;
  }

  if (keyBinding.paste !== undefined && key.paste !== keyBinding.paste) {
    return false;
  }

  if (keyBinding.meta !== undefined && key.meta !== keyBinding.meta) {
    return false;
  }

  return true;
}

/**
 * 检查按键是否匹配命令的任何绑定
 */
function matchCommand(
  command: Command,
  key: Key,
  config: KeyBindingConfig = defaultKeyBindings,
): boolean {
  const bindings = config[command];
  return bindings.some((binding) => matchKeyBinding(binding, key));
}

/**
 * 键匹配器函数类型
 */
type KeyMatcher = (key: Key) => boolean;

/**
 * 映射到 Command 枚举的键匹配器类型
 */
export type KeyMatchers = {
  readonly [C in Command]: KeyMatcher;
};

/**
 * 从键绑定配置创建键匹配器
 * @param config - 键绑定配置，默认为 defaultKeyBindings
 * @returns 键匹配器对象
 */
export function createKeyMatchers(
  config: KeyBindingConfig = defaultKeyBindings,
): KeyMatchers {
  const matchers = {} as { [C in Command]: KeyMatcher };

  for (const command of Object.values(Command)) {
    matchers[command] = (key: Key) => matchCommand(command, key, config);
  }

  return matchers as KeyMatchers;
}

/**
 * 使用默认配置的默认键绑定匹配器
 */
export const keyMatchers: KeyMatchers = createKeyMatchers(defaultKeyBindings);

// 为方便起见，重新导出 Command
export { Command };
