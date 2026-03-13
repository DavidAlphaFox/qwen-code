/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';

/**
 * 主题管理 Hook
 * @function useTheme
 * @description 管理应用的主题状态（浅色/深色/自动），支持本地存储持久化和系统偏好检测
 * @returns {Object} 包含当前主题和切换主题函数的对象
 * @returns {'light' | 'dark' | 'auto'} returns.theme - 当前主题：light（浅色）、dark（深色）、auto（跟随系统）
 * @returns {Function} returns.toggleTheme - 切换主题的函数，在light和dark之间切换
 *
 * @example
 * const { theme, toggleTheme } = useTheme();
 * // theme: 'auto' | 'light' | 'dark'
 * // 调用 toggleTheme() 可在浅色和深色之间切换
 */
export const useTheme = () => {
  const [theme, setTheme] = useState<'light' | 'dark' | 'auto'>('auto');

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as
      | 'light'
      | 'dark'
      | 'auto'
      | null;
    if (savedTheme) {
      setTheme(savedTheme);
    } else {
      const prefersDark = window.matchMedia(
        '(prefers-color-scheme: dark)',
      ).matches;
      setTheme(prefersDark ? 'dark' : 'light');
    }
  }, []);

  /**
   * 切换主题
   * @function toggleTheme
   * @description 在浅色主题和深色主题之间切换，不影响auto模式
   */
  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  return { theme, toggleTheme };
};
