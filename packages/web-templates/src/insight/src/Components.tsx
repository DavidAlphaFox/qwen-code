// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React from 'react';
import { useState } from 'react';

// 简单的 Markdown 解析器组件
/**
 * Markdown 文本组件
 * 解析并渲染简单的 Markdown 格式文本（仅支持粗体）
 * @param props - 组件属性
 * @param props.children - 要解析的文本
 */
export function MarkdownText({ children }: { children: string }) {
  if (!children || typeof children !== 'string') return children;

  // Split by bold markers (**text**)
  const parts = children.split(/(\*\*.*?\*\*)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        return part;
      })}
    </>
  );
}

/**
 * 复制按钮组件
 * 点击后将指定文本复制到剪贴板
 * @param props - 组件属性
 * @param props.text - 要复制的文本
 * @param props.label - 按钮标签（默认为 'Copy'）
 */
export function CopyButton({
  text,
  label = 'Copy',
}: {
  text: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button className="copy-btn" onClick={handleCopy}>
      {copied ? 'Copied!' : label}
    </button>
  );
}
