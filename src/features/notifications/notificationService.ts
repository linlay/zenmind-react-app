import { Platform } from 'react-native';
import { MMKV } from 'react-native-mmkv';
import * as Notifications from 'expo-notifications';

import { SessionState } from '../../core/auth/appAuth';
import {
  PushTokenPlatform,
  PushTokenProvider,
  registerPushTokenApi,
  unregisterPushTokenApi,
} from '../../core/api/services/notificationApi';

const CHAT_NOTIFICATION_CHANNEL_ID = 'chat-messages';
const PUSH_REGISTRATION_KEY = 'push_registration_v1';

type ChatNotificationPayload = {
  type: 'chat.message';
  conversationId: string;
  serverMessageId: string;
};

type StoredPushRegistration = {
  fingerprint: string;
  provider: PushTokenProvider;
  platform: PushTokenPlatform;
  nativePushToken: string;
};

type NotificationPayloadListener = (payload: ChatNotificationPayload) => void;

const notificationStorage = new MMKV({ id: 'zenmind-notifications' });
const notificationPayloadListeners = new Set<NotificationPayloadListener>();

let responseSubscription: { remove: () => void } | null = null;
let pendingNotificationPayload: ChatNotificationPayload | null = null;
let activeConversationId: string | null = null;
let registrationPromise: Promise<void> | null = null;
let registrationPromiseKey = '';
let completedRegistrationSessionKey = '';
let isAndroidChannelConfigured = false;

function isNativePushPlatform(): boolean {
  return Platform.OS === 'android' || Platform.OS === 'ios';
}

function readStoredRegistration(): StoredPushRegistration | null {
  const raw = notificationStorage.getString(PUSH_REGISTRATION_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as StoredPushRegistration;
    if (!parsed.fingerprint || !parsed.nativePushToken) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredRegistration(registration: StoredPushRegistration) {
  notificationStorage.set(PUSH_REGISTRATION_KEY, JSON.stringify(registration));
}

function clearStoredRegistration() {
  notificationStorage.delete(PUSH_REGISTRATION_KEY);
}

function getEnvironment(): 'development' | 'production' {
  return __DEV__ ? 'development' : 'production';
}

function resolveProvider(platform: PushTokenPlatform): PushTokenProvider {
  return platform === 'android' ? 'fcm' : 'apns';
}

function buildRegistrationFingerprint(input: {
  username: string;
  deviceId: string;
  provider: PushTokenProvider;
  platform: PushTokenPlatform;
  nativePushToken: string;
  environment: 'development' | 'production';
}) {
  return JSON.stringify([
    input.username,
    input.deviceId,
    input.provider,
    input.platform,
    input.nativePushToken,
    input.environment,
  ]);
}

function buildSessionRegistrationKey(session: SessionState) {
  return JSON.stringify([session.username, session.deviceId]);
}

function parseChatNotificationPayload(data: unknown): ChatNotificationPayload | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const payload = data as Record<string, unknown>;
  const type = String(payload.type || '').trim();
  const conversationId = String(payload.conversationId || '').trim();
  const serverMessageId = String(payload.serverMessageId || '').trim();

  if (type !== 'chat.message' || !conversationId || !serverMessageId) {
    return null;
  }

  return {
    type: 'chat.message',
    conversationId,
    serverMessageId,
  };
}

function emitNotificationPayload(payload: ChatNotificationPayload) {
  if (notificationPayloadListeners.size === 0) {
    pendingNotificationPayload = payload;
    return;
  }

  notificationPayloadListeners.forEach((listener) => listener(payload));
}

function handleNotificationResponse(response: Notifications.NotificationResponse) {
  const payload = parseChatNotificationPayload(response.notification.request.content.data);
  if (!payload) {
    return;
  }

  emitNotificationPayload(payload);

  try {
    Notifications.clearLastNotificationResponse();
  } catch {
    // Unsupported platforms can reject this; duplicate startup handling is still harmless.
  }
}

function ensureNotificationResponseListener() {
  if (responseSubscription || !isNativePushPlatform()) {
    return;
  }

  responseSubscription = Notifications.addNotificationResponseReceivedListener(
    handleNotificationResponse
  );

  try {
    const lastResponse = Notifications.getLastNotificationResponse();
    if (lastResponse) {
      handleNotificationResponse(lastResponse);
    }
  } catch {
    // The native module may be unavailable in web or non-development-build runtimes.
  }
}

async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return true;
  }

  const requested = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });

  return (
    requested.granted || requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') {
    return;
  }
  if (isAndroidChannelConfigured) {
    return;
  }

  await Notifications.setNotificationChannelAsync(CHAT_NOTIFICATION_CHANNEL_ID, {
    name: 'Chat messages',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 180, 250],
    lightColor: '#2f80ed',
  });
  isAndroidChannelConfigured = true;
}

async function syncPushTokenRegistration(session: SessionState) {
  if (!isNativePushPlatform() || !session.deviceId) {
    return;
  }

  await ensureAndroidChannel();
  const hasPermission = await ensureNotificationPermission();
  if (!hasPermission) {
    return;
  }

  const devicePushToken = await Notifications.getDevicePushTokenAsync();
  if (typeof devicePushToken.data !== 'string' || !devicePushToken.data.trim()) {
    return;
  }

  const platform = Platform.OS as PushTokenPlatform;
  const provider = resolveProvider(platform);
  const nativePushToken = devicePushToken.data.trim();
  const environment = getEnvironment();
  const fingerprint = buildRegistrationFingerprint({
    username: session.username,
    deviceId: session.deviceId,
    provider,
    platform,
    nativePushToken,
    environment,
  });

  if (readStoredRegistration()?.fingerprint === fingerprint) {
    return;
  }

  await registerPushTokenApi({
    provider,
    platform,
    nativePushToken,
    deviceId: session.deviceId,
    environment,
  });

  writeStoredRegistration({
    fingerprint,
    provider,
    platform,
    nativePushToken,
  });
}

if (isNativePushPlatform()) {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const payload = parseChatNotificationPayload(notification.request.content.data);
      const isAlreadyOpen =
        payload && activeConversationId && payload.conversationId === activeConversationId;

      return {
        shouldShowBanner: !isAlreadyOpen,
        shouldShowList: !isAlreadyOpen,
        shouldPlaySound: !isAlreadyOpen,
        shouldSetBadge: false,
      };
    },
  });
}

export const notificationService = {
  subscribe(listener: NotificationPayloadListener) {
    notificationPayloadListeners.add(listener);
    ensureNotificationResponseListener();

    if (pendingNotificationPayload) {
      const payload = pendingNotificationPayload;
      pendingNotificationPayload = null;
      listener(payload);
    }

    return () => {
      notificationPayloadListeners.delete(listener);
    };
  },

  setActiveConversationId(conversationId: string | null) {
    activeConversationId = conversationId;
  },

  registerForSession(session: SessionState) {
    const nextRegistrationPromiseKey = buildSessionRegistrationKey(session);
    if (completedRegistrationSessionKey === nextRegistrationPromiseKey) {
      return Promise.resolve();
    }
    if (registrationPromise && registrationPromiseKey === nextRegistrationPromiseKey) {
      return registrationPromise;
    }

    registrationPromiseKey = nextRegistrationPromiseKey;
    registrationPromise = syncPushTokenRegistration(session)
      .then(() => {
        completedRegistrationSessionKey = nextRegistrationPromiseKey;
      })
      .finally(() => {
        if (registrationPromiseKey === nextRegistrationPromiseKey) {
          registrationPromise = null;
          registrationPromiseKey = '';
        }
      });

    return registrationPromise;
  },

  async clearRegistration() {
    const registration = readStoredRegistration();
    completedRegistrationSessionKey = '';
    clearStoredRegistration();
    if (!registration) {
      return;
    }

    try {
      await unregisterPushTokenApi(registration.nativePushToken);
    } catch {
      // Logout must not be blocked by best-effort push token cleanup.
    }
  },
};

export type { ChatNotificationPayload };
