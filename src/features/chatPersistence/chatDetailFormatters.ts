import { defaultT, type TFunction } from '../../shared/i18n/translate.ts';
import { formatConversationTimestamp } from '../../shared/visual/foundation';
import type { ChatSocketStatus } from '../chatRealtime/types';
import type { ChatMessageItem } from './types';

export function formatChatDetailTimestamp(value: number): string {
  return formatConversationTimestamp(value);
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
