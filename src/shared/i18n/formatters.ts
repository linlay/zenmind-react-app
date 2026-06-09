import type { AppLocale } from './locales.ts';
import type { TFunction } from './translate.ts';

const dateTimeFormatters = new Map<AppLocale, Intl.DateTimeFormat>();

function getDateTimeFormatter(locale: AppLocale): Intl.DateTimeFormat {
  const current = dateTimeFormatters.get(locale);
  if (current) {
    return current;
  }

  const formatter = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  dateTimeFormatters.set(locale, formatter);
  return formatter;
}

function formatLocalizedDateTime(locale: AppLocale, timestamp: number): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(timestamp) || Number.isNaN(date.getTime())) {
    return '';
  }

  return getDateTimeFormatter(locale).format(date);
}

export function formatAccessExpiryLabel(locale: AppLocale, t: TFunction, timestamp: number | undefined): string {
  if (!timestamp || !Number.isFinite(timestamp)) {
    return t('common.notSynced');
  }

  const remainingMs = timestamp - Date.now();
  const dateText = formatLocalizedDateTime(locale, timestamp);
  if (remainingMs <= 0) {
    return t('common.expiredAt', { date: dateText });
  }

  const remainingMinutes = Math.ceil(remainingMs / 60_000);
  if (remainingMinutes < 60) {
    return t('common.relativeAt', {
      relative: t('common.minutesLater', { count: remainingMinutes }),
      date: dateText
    });
  }

  const remainingHours = Math.ceil(remainingMinutes / 60);
  if (remainingHours < 24) {
    return t('common.relativeAt', {
      relative: t('common.hoursLater', { count: remainingHours }),
      date: dateText
    });
  }

  return t('common.relativeAt', {
    relative: t('common.daysLater', { count: Math.ceil(remainingHours / 24) }),
    date: dateText
  });
}
