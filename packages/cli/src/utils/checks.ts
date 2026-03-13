/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* 编译时检查意外值 */
export function assumeExhaustive(_value: never): void {}

/**
 * 对意外值抛出异常
 * 常见用例是 switch 语句：
 * switch(enumValue) {
 *   case Enum.A:
 *   case Enum.B:
 *     break;
 *   default:
 *     checkExhaustive(enumValue);
 * }
 * @param value - 应该为 never 类型的值
 * @param msg - 可选的错误消息
 * @returns never 此函数总是抛出异常
 */
export function checkExhaustive(
  value: never,
  msg = `unexpected value ${value}!`,
): never {
  assumeExhaustive(value);
  throw new Error(msg);
}
