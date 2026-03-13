/* eslint-disable @typescript-eslint/no-explicit-any */
import type { InsightData } from '../../../src/services/insight/types/StaticInsightTypes';
import type { QualitativeInsights as QualitativeData } from '../../../src/services/insight/types/QualitativeInsightTypes';

/**
 * 全局窗口对象类型扩展
 * 定义 Insight Web 应用可用的全局变量
 */
declare global {
  interface Window {
    React: typeof import('react');
    ReactDOM: typeof import('react-dom/client');
    Chart: any;
    html2canvas: any;
    /** 洞察数据，由服务器端注入 */
    INSIGHT_DATA: InsightData;
  }
}

/** 导出 InsightData 和 QualitativeData 类型 */
export type { InsightData, QualitativeData };
