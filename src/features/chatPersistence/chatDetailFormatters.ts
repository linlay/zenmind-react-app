import { defaultT, type TFunction } from '../../shared/i18n/translate.ts';
import type { ChatSocketStatus } from '../chatRealtime/types';
import type { ChatMessageItem } from './types';

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;
const TENTHS_PER_SECOND = 10;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function isSameLocalDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatSecondTenths(value: number): string {
  const wholeSeconds = Math.floor(value / TENTHS_PER_SECOND);
  const tenths = value % TENTHS_PER_SECOND;
  return tenths === 0 ? String(wholeSeconds) : `${wholeSeconds}.${tenths}`;
}

export function formatChatDetailTimestamp(value: number, now: number = Date.now()): string {
  const numericValue = Number(value);
  const numericNow = Number(now);
  if (!Number.isFinite(numericValue) || numericValue <= 0 || !Number.isFinite(numericNow)) {
    return '';
  }

  const timestamp = new Date(numericValue);
  const current = new Date(numericNow);
  if (Number.isNaN(timestamp.getTime()) || Number.isNaN(current.getTime())) {
    return '';
  }

  const timeText = `${pad2(timestamp.getHours())}:${pad2(timestamp.getMinutes())}`;
  if (isSameLocalDay(timestamp, current)) {
    return timeText;
  }

  return `${timestamp.getFullYear()}/${pad2(timestamp.getMonth() + 1)}/${pad2(timestamp.getDate())} ${timeText}`;
}

export function formatChatDetailDuration(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }

  const durationMs = Number(value);
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return '';
  }

  const totalTenths = Math.round(durationMs / 100);
  const totalSeconds = Math.floor(totalTenths / TENTHS_PER_SECOND);
  const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const seconds = formatSecondTenths(
    (totalSeconds % SECONDS_PER_MINUTE) * TENTHS_PER_SECOND + (totalTenths % TENTHS_PER_SECOND)
  );

  if (hours > 0) {
    return `${hours}时${minutes}分${seconds}秒`;
  }
  if (minutes > 0) {
    return `${minutes}分${seconds}秒`;
  }
  return `${seconds}秒`;
}

export function formatChatStatusLabel(status: ChatSocketStatus, t: TFunction = defaultT): string {
  switch (status) {
    case 'connected':
      return t('chatDetail.status.connected');
    case 'connecting':
      return t('chatDetail.status.connecting');
    case 'reconnecting':
      return t('chatDetail.status.reconnecting');
    case 'disconnected':
      return t('chatDetail.status.disconnected');
    case 'idle':
    default:
      return t('chatDetail.status.idle');
  }
}

export function formatMessageDeliveryStatusLabel(
  status: ChatMessageItem['deliveryStatus'],
  t: TFunction = defaultT
): string {
  switch (status) {
    case 'pending':
      return t('composer.sending');
    case 'failed':
      return t('attachment.status.failed');
    case 'sent':
    default:
      return t('attachment.status.ready');
  }
}

export function formatMessageRoleLabel(
  role: ChatMessageItem['role'],
  t: TFunction = defaultT
): string {
  return role === 'user' ? t('chatDetail.role.user') : t('chatDetail.role.assistant');
}
