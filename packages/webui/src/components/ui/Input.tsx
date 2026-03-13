/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ReactNode } from 'react';
import { forwardRef } from 'react';

/**
 * 输入框尺寸类型
 * @typedef {'sm' | 'md' | 'lg'} InputSize
 * @description 定义输入框的尺寸：sm（小）、md（中）、lg（大）
 */
export type InputSize = 'sm' | 'md' | 'lg';

/**
 * 输入框组件属性接口
 * @interface InputProps
 * @description Input组件的属性定义，继承自HTML输入元素的所有属性（size除外）
 */
export interface InputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'size'
> {
  /** 输入框尺寸 */
  size?: InputSize;
  /** 错误状态 */
  error?: boolean;
  /** 错误提示信息 */
  errorMessage?: string;
  /** 输入框标签 */
  label?: string;
  /** 输入框下方的辅助文本 */
  helperText?: string;
  /** 左侧元素（如图标） */
  leftElement?: ReactNode;
  /** 右侧元素（如图标） */
  rightElement?: ReactNode;
  /** 是否占满宽度 */
  fullWidth?: boolean;
}

/**
 * 输入框组件
 * @component
 * @description 多尺寸、多状态的输入框组件，支持错误提示、标签和辅助文本
 *
 * @param {InputProps} props - 组件属性
 * @param {React.Ref<HTMLInputElement>} ref - 转发给底层input元素的引用
 * @returns {JSX.Element} React输入框元素
 *
 * @example
 * // 基本用法
 * <Input
 *   label="邮箱"
 *   placeholder="请输入邮箱"
 * />
 *
 * @example
 * // 带错误提示
 * <Input
 *   label="邮箱"
 *   placeholder="请输入邮箱"
 *   error={hasError}
 *   errorMessage="请输入有效的邮箱地址"
 * />
 *
 * @example
 * // 带图标
 * <Input
 *   placeholder="搜索..."
 *   leftElement={<SearchIcon />}
 *   rightElement={<ClearIcon />}
 * />
 */
const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      size = 'md',
      error = false,
      errorMessage,
      label,
      helperText,
      leftElement,
      rightElement,
      fullWidth = false,
      className = '',
      id,
      disabled,
      ...props
    },
    ref,
  ) => {
    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;

    const baseClasses =
      'border rounded transition-colors focus:outline-none focus:ring-2';

    const sizeClasses: Record<InputSize, string> = {
      sm: 'px-2 py-1 text-sm',
      md: 'px-3 py-2',
      lg: 'px-4 py-3 text-lg',
    };

    const stateClasses = error
      ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
      : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500';

    const disabledClasses = disabled
      ? 'bg-gray-100 cursor-not-allowed opacity-60'
      : 'bg-white';

    const widthClass = fullWidth ? 'w-full' : '';

    const paddingClasses = [
      leftElement ? 'pl-10' : '',
      rightElement ? 'pr-10' : '',
    ].join(' ');

    return (
      <div className={`${fullWidth ? 'w-full' : 'inline-block'}`}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {leftElement && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
              {leftElement}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            aria-invalid={error}
            aria-describedby={
              errorMessage
                ? `${inputId}-error`
                : helperText
                  ? `${inputId}-helper`
                  : undefined
            }
            className={`${baseClasses} ${sizeClasses[size]} ${stateClasses} ${disabledClasses} ${widthClass} ${paddingClasses} ${className}`.trim()}
            {...props}
          />
          {rightElement && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
              {rightElement}
            </div>
          )}
        </div>
        {errorMessage && error && (
          <p id={`${inputId}-error`} className="mt-1 text-sm text-red-600">
            {errorMessage}
          </p>
        )}
        {helperText && !error && (
          <p id={`${inputId}-helper`} className="mt-1 text-sm text-gray-500">
            {helperText}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';

export default Input;
