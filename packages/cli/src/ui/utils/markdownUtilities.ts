/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/*
**背景与目的：**

`findSafeSplitPoint` 函数旨在解决显示或处理大型、可能正在流式传输的 Markdown 文本的挑战。当内容（例如来自 LLM（如 Gemini）的内容）以块形式到达或增长到超出单个显示单元（如消息气泡）的大小时，需要进行分割。简单的分割（例如仅在字符限制处）可能会破坏 Markdown 格式，特别是对于代码块、列表或引用等多行元素，导致渲染错误。

此函数旨在在提供的 `content` 字符串中找到一个"智能"或"安全"的索引来进行分割，优先考虑保持 Markdown 的完整性。

**关键期望与行为（优先级）：**

1.  **如果足够短则不分割：**
    * 如果 `content.length` 小于或等于 `idealMaxLength`，函数应返回 `content.length`（表示不需要因长度原因进行分割）。

2.  **代码块完整性（安全的最高优先级）：**
    * 函数必须尝试避免在 fenced 代码块内分割（即在 ` ``` ` 和 ` ``` ` 之间）。
    * 如果 `idealMaxLength` 落在代码块内：
        * 函数将尝试返回一个在代码块开始之前分割内容的索引。
        * 如果代码块在 `content` 的开头开始，而 `idealMaxLength` 落在其中（意味着该块本身对于第一个块来说太长了），函数可能会返回 `0`。这实际上会使第一个块为空，将整个过大的代码块推到分割的第二部分。
    * 当考虑在代码块附近进行分割时，函数更愿意将整个代码块完整地保留在结果块之一中。

3.  **Markdown 感知的换行分割（如果不受代码块逻辑支配）：**
    * 如果 `idealMaxLength` 不在代码块内（或在代码块考虑之后），函数将从 `idealMaxLength` 向后扫描以寻找自然断点：
        * **段落分隔符：** 优先在双换行符（`\n\n`）后分割，因为这通常表示段落或块级元素的结束。
        * **单行换行符：** 如果在合适范围内找不到双换行符，则寻找单换行符（`\n`）。
    * 选择的任何换行符分割点也不能在代码块内。

4.  **回退到 `idealMaxLength`：**
    * 如果在 `idealMaxLength` 之前或处没有找到"更安全"的分割点（尊重代码块或找到合适的换行符），并且 `idealMaxLength` 本身不被确定为不安全的分割点（例如在代码块内），函数可能会返回大于 `idealMaxLength` 的长度，同样不能破坏 markdown 格式。这可能发生在没有 Markdown 块结构或换行符的非常长的文本行上。

**实质上，`findSafeSplitPoint` 在被迫分割内容时试图成为一个良好的 Markdown 公民，优先考虑结构边界而非任意字符限制，并强烈强调不破坏代码块。**
*/

/**
 * 检查给定字符串内的字符索引是否在 fenced（```）代码块内
 * @param content - 完整字符串内容
 * @param indexToTest - 要测试的字符索引
 * @returns 如果索引在代码块内容内则返回 true，否则返回 false
 */
const isIndexInsideCodeBlock = (
  content: string,
  indexToTest: number,
): boolean => {
  let fenceCount = 0;
  let searchPos = 0;
  while (searchPos < content.length) {
    const nextFence = content.indexOf('```', searchPos);
    if (nextFence === -1 || nextFence >= indexToTest) {
      break;
    }
    fenceCount++;
    searchPos = nextFence + 3;
  }
  return fenceCount % 2 === 1;
};

/**
 * Finds the starting index of the code block that encloses the given index.
 * Returns -1 if the index is not inside a code block.
 * @param content The markdown content.
 * @param index The index to check.
 * @returns Start index of the enclosing code block or -1.
 */
const findEnclosingCodeBlockStart = (
  content: string,
  index: number,
): number => {
  if (!isIndexInsideCodeBlock(content, index)) {
    return -1;
  }
  let currentSearchPos = 0;
  while (currentSearchPos < index) {
    const blockStartIndex = content.indexOf('```', currentSearchPos);
    if (blockStartIndex === -1 || blockStartIndex >= index) {
      break;
    }
    const blockEndIndex = content.indexOf('```', blockStartIndex + 3);
    if (blockStartIndex < index) {
      if (blockEndIndex === -1 || index < blockEndIndex + 3) {
        return blockStartIndex;
      }
    }
    if (blockEndIndex === -1) break;
    currentSearchPos = blockEndIndex + 3;
  }
  return -1;
};

export const findLastSafeSplitPoint = (content: string) => {
  const enclosingBlockStart = findEnclosingCodeBlockStart(
    content,
    content.length,
  );
  if (enclosingBlockStart !== -1) {
    // The end of the content is contained in a code block. Split right before.
    return enclosingBlockStart;
  }

  // Search for the last double newline (\n\n) not in a code block.
  let searchStartIndex = content.length;
  while (searchStartIndex >= 0) {
    const dnlIndex = content.lastIndexOf('\n\n', searchStartIndex);
    if (dnlIndex === -1) {
      // No more double newlines found.
      break;
    }

    const potentialSplitPoint = dnlIndex + 2;
    if (!isIndexInsideCodeBlock(content, potentialSplitPoint)) {
      return potentialSplitPoint;
    }

    // If potentialSplitPoint was inside a code block,
    // the next search should start *before* the \n\n we just found to ensure progress.
    searchStartIndex = dnlIndex - 1;
  }

  // If no safe double newline is found, return content.length
  // to keep the entire content as one piece.
  return content.length;
};
