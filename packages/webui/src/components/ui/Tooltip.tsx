/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FC } from 'react';

/**
 * 提示框组件属性
 * @interface TooltipProps
 * @description Tooltip组件的属性定义，用于在鼠标悬停时显示提示信息
 */
export interface TooltipProps {
  /** 需要包裹提示框的子元素 */
  children: React.ReactNode;
  /** 提示框内容（可以是字符串或React节点） */
  content: React.ReactNode;
  /** 提示框相对于子元素的位置 */
  position?: 'top' | 'bottom' | 'left' | 'right';
}

/**
 * 提示框组件
 * @component
 * @description 使用CSS group-hover实现鼠标悬停显示提示信息，支持主题变量定制
 *
 * @param {TooltipProps} props - 组件属性
 * @returns {JSX.Element} React元素
 *
 * @example
 * // 顶部提示
 * <Tooltip content="这是一个提示">
 *   <span>鼠标悬停在我上面</span>
 * </Tooltip>
 *
 * @example
 * // 右侧提示
 * <Tooltip content="查看详情" position="right">
 *   <Button>更多信息</Button>
 * </Tooltip>
 */
export const Tooltip: FC<TooltipProps> = ({
  children,
  content,
  position = 'top',
}) => (
  <div className="relative inline-block">
    <div className="group relative">
      {children}
      <div
        className={`
          absolute z-50 px-2 py-1 text-xs rounded-md shadow-lg
          bg-[var(--app-primary-background,#1f2937)] border border-[var(--app-input-border,#374151)]
          text-[var(--app-primary-foreground,#f9fafb)] whitespace-nowrap
          opacity-0 group-hover:opacity-100 transition-opacity duration-150
          -translate-x-1/2 left-1/2
          ${
            position === 'top'
              ? '-translate-y-1 bottom-full mb-1'
              : position === 'bottom'
                ? 'translate-y-1 top-full mt-1'
                : position === 'left'
                  ? '-translate-x-full left-0 translate-y-[-50%] top-1/2'
                  : 'translate-x-0 right-0 translate-y-[-50%] top-1/2'
          }
          pointer-events-none
        `}
      >
        {content}
        <div
          className={`
            absolute w-2 h-2 bg-[var(--app-primary-background,#1f2937)] border-l border-b border-[var(--app-input-border,#374151)]
            -rotate-45
            ${
              position === 'top'
                ? 'top-full left-1/2 -translate-x-1/2 -translate-y-1/2'
                : position === 'bottom'
                  ? 'bottom-full left-1/2 -translate-x-1/2 translate-y-1/2'
                  : position === 'left'
                    ? 'right-full top-1/2 translate-x-1/2 -translate-y-1/2'
                    : 'left-full top-1/2 -translate-x-1/2 -translate-y-1/2'
            }
          `}
        />
      </div>
    </div>
  </div>
);

export default Tooltip;
