/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FC } from 'react';

/**
 * 容器组件属性
 * @interface ContainerProps
 * @description 布局容器组件的属性
 */
interface ContainerProps {
  /** 子组件 */
  children: React.ReactNode;
  /** 自定义CSS类名 */
  className?: string;
}

/**
 * 容器组件
 * @component
 * @description 提供响应式布局容器的包装组件，自动居中和添加内边距
 *
 * @param {ContainerProps} props - 组件属性
 * @returns {JSX.Element} React元素
 */
const Container: FC<ContainerProps> = ({ children, className = '' }) => (
  <div className={`container mx-auto px-4 ${className}`}>{children}</div>
);

export default Container;
