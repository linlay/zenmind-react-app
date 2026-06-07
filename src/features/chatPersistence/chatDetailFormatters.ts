import { formatConversationTimestamp } from '../../shared/visual/foundation';
import type { ChatSocketStatus } from '../chatRealtime/types';
import type { ChatMessageItem } from './types';

export function formatChatDetailTimestamp(value: number): string {
  return formatConversationTimestamp(value);
}

export function formatChatStatusLabel(status: ChatSocketStatus): string {
  switch (status) {
    case 'connected':
      return '已连接';
    case 'connecting':
      return '连接中';
    case 'reconnecting':
      return '重连中';
    case 'disconnected':
      return '已断开';
    case 'idle':
    default:
      return '空闲';
  }
}

export function formatMessageDeliveryStatusLabel(
  status: ChatMessageItem['deliveryStatus']
): string {
  switch (status) {
    case 'pending':
      return '发送中';
    case 'failed':
      return '发送失败';
    case 'sent':
    default:
      return '已发送';
  }
}

export function formatMessageRoleLabel(role: ChatMessageItem['role']): string {
  return role === 'user' ? '我' : '助手';
}
