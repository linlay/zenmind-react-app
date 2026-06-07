import { authenticatedApiRequest } from '../apiClient';

export type PushTokenProvider = 'fcm' | 'apns';
export type PushTokenPlatform = 'android' | 'ios';

export type RegisterPushTokenParams = {
  provider: PushTokenProvider;
  platform: PushTokenPlatform;
  nativePushToken: string;
  deviceId: string;
  environment: 'development' | 'production';
};

export type RegisterPushTokenResponse = {
  registered: boolean;
};

export type NotificationMessageDetailResponse = {
  conversation: {
    conversationId: string;
    title: string;
    unreadCount?: number;
  };
  message: {
    conversationId: string;
    serverMessageId: string;
    content: string;
    createdAt: number;
    role: 'assistant' | 'user';
  };
};

export async function registerPushTokenApi(
  params: RegisterPushTokenParams
): Promise<RegisterPushTokenResponse> {
  return authenticatedApiRequest<RegisterPushTokenResponse>({
    path: '/api/notifications/device-tokens',
    method: 'POST',
    body: params,
  });
}

export async function unregisterPushTokenApi(nativePushToken: string): Promise<void> {
  await authenticatedApiRequest<null>({
    path: `/api/notifications/device-tokens/${encodeURIComponent(nativePushToken)}`,
    method: 'DELETE',
  });
}

export async function getNotificationMessageDetailApi(
  serverMessageId: string
): Promise<NotificationMessageDetailResponse> {
  return authenticatedApiRequest<NotificationMessageDetailResponse>({
    path: `/api/chat/messages/${encodeURIComponent(serverMessageId)}`,
    method: 'GET',
  });
}
