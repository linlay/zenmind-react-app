import { DEFAULT_LOCALE, type AppLocale } from './locales.ts';
import { messages, type I18nKey } from './messages/index.ts';

export type { I18nKey } from './messages/index.ts';

export type I18nParams = Record<string, string | number>;
export type TFunction = (key: I18nKey, params?: I18nParams) => string;

const INTERPOLATION_PATTERN = /\{(\w+)\}/g;

function interpolate(template: string, params: I18nParams | undefined): string {
  if (!params || template.indexOf('{') < 0) {
    return template;
  }

  return template.replace(INTERPOLATION_PATTERN, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export function translate(locale: AppLocale, key: I18nKey, params?: I18nParams): string {
  const table = messages[locale] || messages[DEFAULT_LOCALE];
  const fallback = messages[DEFAULT_LOCALE][key];
  return interpolate(table[key] || fallback || key, params);
}

export function createTranslator(locale: AppLocale): TFunction {
  return (key, params) => translate(locale, key, params);
}

export const defaultT = createTranslator(DEFAULT_LOCALE);
