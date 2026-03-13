/**
 * SVG 模块声明
 * 允许导入 SVG 文件作为字符串
 */
declare module '*.svg' {
  const content: string;
  export default content;
}

/**
 * CSS 模块声明
 * 允许导入 CSS 文件作为字符串
 */
declare module '*.css' {
  const content: string;
  export default content;
}
