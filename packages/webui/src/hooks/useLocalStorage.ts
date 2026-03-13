/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';

/**
 * 本地存储 Hook
 * @function useLocalStorage
 * @description 用于管理本地存储的React Hook，提供状态持久化功能，支持任意类型的值存储
 * @template T - 存储值的类型
 * @param {string} key - 本地存储的键名
 * @param {T} initialValue - 初始值，当存储中不存在该键时使用
 * @returns {readonly [T, (value: T | ((val: T) => T)) => void]} 返回一个元组，包含当前值和更新函数
 * @returns {T} returns[0] - 当前存储的值
 * @returns {Function} returns[1] - 更新值的函数，支持直接传入值或传入一个更新函数
 *
 * @example
 * // 存储字符串
 * const [username, setUsername] = useLocalStorage('username', 'default');
 *
 * // 存储对象
 * const [user, setUser] = useLocalStorage('user', { name: 'John', age: 30 });
 *
 * // 使用函数更新
 * setUser(prev => ({ ...prev, age: prev.age + 1 }));
 */
export const useLocalStorage = <T>(key: string, initialValue: T) => {
  // Get value from localStorage or use initial value
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (_error) {
      return initialValue;
    }
  });

  // Update localStorage when state changes
  /**
   * 设置本地存储值
   * @function setValue
   * @param {T | ((val: T) => T)} value - 新值或更新函数
   */
  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore =
        value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(error);
    }
  };

  return [storedValue, setValue] as const;
};
