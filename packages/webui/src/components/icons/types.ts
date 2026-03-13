/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * 通用图标属性接口定义
 */

import type { SVGProps } from 'react';

/**
 * 图标组件属性接口
 * @interface IconProps
 * @description 继承自SVG元素的所有属性，并添加自定义属性
 */
export interface IconProps extends SVGProps<SVGSVGElement> {
  /**
   * 图标尺寸（宽度和高度）
   * @default 16
   */
  size?: number;

  /**
   * 额外的CSS类名
   */
  className?: string;
}
