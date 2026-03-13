/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ReactNode } from 'react';
import { forwardRef } from 'react';

/**
 * 按钮变体类型
 * @typedef {'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'} ButtonVariant
 * @description 定义按钮的视觉风格：primary（主要）、secondary（次要）、danger（危险）、ghost（幽灵）、outline（轮廓）
 */
export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'ghost'
  | 'outline';

/**
 * 按钮尺寸类型
 * @typedef {'sm' | 'md' | 'lg'} ButtonSize
 * @description 定义按钮的尺寸：sm（小）、md（中）、lg（大）
 */
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * 按钮组件属性接口
 * @interface ButtonProps
 * @description Button组件的属性定义，继承自HTML按钮元素的所有属性
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** 按钮内容 */
  children: ReactNode;
  /** 视觉风格变体 */
  variant?: ButtonVariant;
  /** 按钮尺寸 */
  size?: ButtonSize;
  /** 加载状态 - 显示加载动画并禁用按钮 */
  loading?: boolean;
  /** 显示在内容左侧的图标 */
  leftIcon?: ReactNode;
  /** 显示在内容右侧的图标 */
  rightIcon?: ReactNode;
  /** 是否占满宽度 */
  fullWidth?: boolean;
}

/**
 * 按钮组件
 * @component
 * @description 多样式、多尺寸的按钮组件，支持加载状态和自定义图标
 *
 * @param {ButtonProps} props - 组件属性
 * @param {React.Ref<HTMLButtonElement>} ref - 转发给底层button元素的引用
 * @returns {JSX.Element} React按钮元素
 *
 * @example
 * // 主要按钮
 * <Button variant="primary" size="md" onClick={handleClick}>
 *   点击我
 * </Button>
 *
 * @example
 * // 加载状态按钮
 * <Button variant="primary" loading={true}>
 *   处理中...
 * </Button>
 *
 * @example
 * // 带图标的按钮
 * <Button variant="outline" leftIcon={<SaveIcon />}>
 *   保存
 * </Button>
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      disabled = false,
      loading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      className = '',
      type = 'button',
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    const baseClasses =
      'inline-flex items-center justify-center rounded font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2';

    const variantClasses: Record<ButtonVariant, string> = {
      primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
      secondary:
        'bg-gray-200 text-gray-800 hover:bg-gray-300 focus:ring-gray-500',
      danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
      ghost:
        'bg-transparent text-gray-700 hover:bg-gray-100 focus:ring-gray-400',
      outline:
        'bg-transparent border border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-gray-400',
    };

    const sizeClasses: Record<ButtonSize, string> = {
      sm: 'px-2 py-1 text-sm gap-1',
      md: 'px-4 py-2 gap-2',
      lg: 'px-6 py-3 text-lg gap-2',
    };

    const disabledClass = isDisabled
      ? 'opacity-50 cursor-not-allowed pointer-events-none'
      : '';
    const widthClass = fullWidth ? 'w-full' : '';

    return (
      <button
        ref={ref}
        type={type}
        className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${disabledClass} ${widthClass} ${className}`.trim()}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        aria-busy={loading}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
        {!loading && leftIcon}
        {children}
        {!loading && rightIcon}
      </button>
    );
  },
);

Button.displayName = 'Button';

export default Button;
