export type AppsAppKey = 'notebook' | 'ledger';

export interface AppsAppDefinition {
  key: AppsAppKey;
  name: string;
  description: string;
  status: string;
  url: string;
}

export const APPS: AppsAppDefinition[] = [
  {
    key: 'notebook',
    name: '记事本',
    description: '',
    status: '建设中',
    url: 'https://app.zenmind.cc/ma/note/'
  },
  {
    key: 'ledger',
    name: '记账本',
    description: '',
    status: '建设中',
    url: 'https://app.zenmind.cc/ma/cost/'
  }
];

export function getAppByKey(appKey?: string | null): AppsAppDefinition | null {
  const normalizedKey = String(appKey || '').trim();
  return APPS.find((item) => item.key === normalizedKey) || null;
}
