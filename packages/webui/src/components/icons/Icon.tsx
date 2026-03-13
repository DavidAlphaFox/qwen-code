/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FC } from 'react';

/**
 * 图标组件属性
 * @interface IconProps
 * @description 通用的图标组件属性
 */
interface IconProps {
  /** 图标名称 */
  name: string;
  /** 图标尺寸（像素），默认24 */
  size?: number;
  /** 图标颜色，默认继承父元素颜色 */
  color?: string;
  /** 自定义CSS类名 */
  className?: string;
}

/**
 * 通用图标组件
 * @component
 * @description 通用的图标组件，用于显示各种图标（占位符实现）
 *
 * @param {IconProps} props - 组件属性
 * @returns {JSX.Element} SVG图标元素
 *
 * @example
 * // 基本用法
 * <Icon name="home" size={24} />
 *
 * @example
 * // 自定义颜色
 * <Icon name="settings" color="#ff0000" className="my-icon" />
 */
const Icon: FC<IconProps> = ({
  name,
  size = 24,
  color = 'currentColor',
  className = '',
}) => (
  // This is a placeholder - in a real implementation you might use an icon library
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={color}
    className={className}
  >
    <text
      x="50%"
      y="50%"
      dominantBaseline="middle"
      textAnchor="middle"
      fontSize="10"
    >
      {name}
    </text>
  </svg>
);
export default Icon;
