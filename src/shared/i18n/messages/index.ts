import { enUS } from './en-US.ts';
import { zhCN } from './zh-CN.ts';

export type { I18nKey } from './zh-CN.ts';

export const messages = {
  'zh-CN': zhCN,
  'en-US': enUS
} as const;
