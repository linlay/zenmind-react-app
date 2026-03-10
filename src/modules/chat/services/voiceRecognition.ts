import { PermissionsAndroid, Platform } from 'react-native';

export type VoiceInputState = 'idle' | 'listening' | 'stopping' | 'error';

type VoiceRecognitionErrorCode = 'unsupported' | 'permission_denied' | 'start_failed' | 'recognition_failed';

export type VoiceRecognitionError = {
  code: VoiceRecognitionErrorCode;
  message: string;
};

type VoiceRecognitionModule = {
  isAvailable?: () => Promise<boolean | number>;
  start?: (locale?: string, options?: Record<string, unknown>) => Promise<void>;
  stop?: () => Promise<void>;
  cancel?: () => Promise<void>;
  destroy?: () => Promise<void>;
  removeAllListeners?: () => void;
  onSpeechResults?: ((event: { value?: string[] }) => void) | undefined;
  onSpeechError?: ((event: unknown) => void) | undefined;
  onSpeechEnd?: ((event?: unknown) => void) | undefined;
};

type StartVoiceRecognitionOptions = {
  locale: string;
  onFinalResult: (transcript: string) => void;
  onError: (error: VoiceRecognitionError) => void;
  onEnd: () => void;
};

let activeSessionId = 0;

function loadVoiceModule(): VoiceRecognitionModule | null {
  if (Platform.OS === 'web') {
    return null;
  }
  try {
    const loaded = require('@react-native-voice/voice');
    return (loaded?.default || loaded) as VoiceRecognitionModule;
  } catch {
    return null;
  }
}

function clearVoiceHandlers(voiceModule: VoiceRecognitionModule | null) {
  if (!voiceModule) {
    return;
  }
  voiceModule.onSpeechResults = undefined;
  voiceModule.onSpeechError = undefined;
  voiceModule.onSpeechEnd = undefined;
}

function normalizeTranscript(value: unknown): string {
  if (!Array.isArray(value)) {
    return '';
  }
  return value.map((item) => String(item || '').trim()).find((item) => Boolean(item)) || '';
}

function normalizeVoiceError(error: unknown): VoiceRecognitionError {
  const record = (error && typeof error === 'object' ? error : {}) as {
    code?: unknown;
    message?: unknown;
    error?: { code?: unknown; message?: unknown } | string;
  };
  const nested =
    record.error && typeof record.error === 'object' ? (record.error as { code?: unknown; message?: unknown }) : null;
  const code = String(nested?.code || record.code || '').trim().toLowerCase();
  const message = String(nested?.message || record.message || record.error || '').trim() || '语音识别失败，请重试';
  const hint = `${code} ${message}`.toLowerCase();

  if (
    hint.includes('permission') ||
    hint.includes('not authorized') ||
    hint.includes('denied') ||
    hint.includes('restricted')
  ) {
    return {
      code: 'permission_denied',
      message: '请开启麦克风和语音识别权限后重试'
    };
  }

  if (
    hint.includes('not available') ||
    hint.includes('service not available') ||
    hint.includes('speech recognition not available') ||
    hint.includes('recognizer')
  ) {
    return {
      code: 'unsupported',
      message: '当前设备不支持语音输入'
    };
  }

  return {
    code: 'recognition_failed',
    message
  };
}

export async function isVoiceRecognitionAvailable(): Promise<boolean> {
  const voiceModule = loadVoiceModule();
  if (!voiceModule?.isAvailable) {
    return false;
  }
  try {
    return Boolean(await voiceModule.isAvailable());
  } catch {
    return false;
  }
}

export async function requestVoiceRecognitionPermission(): Promise<{ granted: boolean; message: string }> {
  if (Platform.OS !== 'android') {
    return { granted: true, message: '' };
  }

  try {
    const permission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
    const hasPermission = await PermissionsAndroid.check(permission);
    if (hasPermission) {
      return { granted: true, message: '' };
    }
    const result = await PermissionsAndroid.request(permission, {
      title: '需要麦克风权限',
      message: '开启麦克风权限后，才能使用语音输入。',
      buttonPositive: '允许',
      buttonNegative: '拒绝',
      buttonNeutral: '稍后'
    });
    return {
      granted: result === PermissionsAndroid.RESULTS.GRANTED,
      message: result === PermissionsAndroid.RESULTS.GRANTED ? '' : '请开启麦克风权限后重试'
    };
  } catch {
    return {
      granted: false,
      message: '麦克风权限请求失败，请稍后重试'
    };
  }
}

export async function startVoiceRecognition({
  locale,
  onFinalResult,
  onError,
  onEnd
}: StartVoiceRecognitionOptions): Promise<{ ok: true } | { ok: false; error: VoiceRecognitionError }> {
  const voiceModule = loadVoiceModule();
  if (!voiceModule?.start || !voiceModule.stop) {
    return {
      ok: false,
      error: {
        code: 'unsupported',
        message: '当前设备不支持语音输入'
      }
    };
  }

  activeSessionId += 1;
  const sessionId = activeSessionId;
  clearVoiceHandlers(voiceModule);

  voiceModule.onSpeechResults = (event) => {
    if (sessionId !== activeSessionId) {
      return;
    }
    const transcript = normalizeTranscript(event?.value);
    if (transcript) {
      onFinalResult(transcript);
    }
  };
  voiceModule.onSpeechError = (event) => {
    if (sessionId !== activeSessionId) {
      return;
    }
    onError(normalizeVoiceError(event));
  };
  voiceModule.onSpeechEnd = () => {
    if (sessionId !== activeSessionId) {
      return;
    }
    onEnd();
  };

  try {
    await voiceModule.start(locale, {
      EXTRA_PARTIAL_RESULTS: false,
      REQUEST_PERMISSIONS_AUTO: false
    });
    return { ok: true };
  } catch (error) {
    clearVoiceHandlers(voiceModule);
    const normalized = normalizeVoiceError(error);
    return {
      ok: false,
      error: {
        code: normalized.code === 'recognition_failed' ? 'start_failed' : normalized.code,
        message: normalized.message
      }
    };
  }
}

export async function stopVoiceRecognition(): Promise<void> {
  const voiceModule = loadVoiceModule();
  if (!voiceModule?.stop) {
    return;
  }
  await voiceModule.stop();
}

export async function destroyVoiceRecognition(): Promise<void> {
  const voiceModule = loadVoiceModule();
  activeSessionId += 1;
  clearVoiceHandlers(voiceModule);
  if (!voiceModule) {
    return;
  }
  try {
    await voiceModule.cancel?.();
  } catch {
    // Ignore cancel failures during teardown.
  }
  try {
    await voiceModule.destroy?.();
  } catch {
    // Ignore destroy failures during teardown.
  }
  try {
    voiceModule.removeAllListeners?.();
  } catch {
    // Ignore listener cleanup failures.
  }
}
