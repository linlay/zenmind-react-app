import { readPublicEnv } from '../../core/config/runtimeEnv.ts';

export type WsDebugDirection = 'incoming' | 'outgoing' | 'status' | 'parse_error';

export type WsDebugRecord = {
  id: number;
  timestamp: number;
  direction: WsDebugDirection;
  frame: string;
  type: string;
  requestId: string;
  payloadBytes: number;
  json: string;
  truncated: boolean;
};

type WsDebugSnapshot = {
  enabled: boolean;
  mirrorToConsole: boolean;
  records: WsDebugRecord[];
};

type WsDebugListener = (snapshot: WsDebugSnapshot) => void;

const IS_DEV = typeof __DEV__ !== 'undefined' && __DEV__;
const MAX_RECORDS = 200;
const MAX_JSON_CHARS = 12_000;
const REDACTED = '[redacted]';

function isInitialCaptureEnabled() {
  if (!IS_DEV) {
    return false;
  }

  return String(readPublicEnv('EXPO_PUBLIC_WS_DEBUG') || '').trim() !== '0';
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function shouldRedactKey(key: string) {
  const normalizedKey = key.toLowerCase();
  return (
    normalizedKey.includes('token') ||
    normalizedKey.includes('authorization') ||
    normalizedKey.includes('password') ||
    normalizedKey.includes('secret') ||
    normalizedKey === 'cookie' ||
    normalizedKey === 'set-cookie'
  );
}

function redactValue(value: unknown, depth: number = 0): unknown {
  if (depth > 8) {
    return '[max-depth]';
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1));
  }

  if (!isObjectRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      shouldRedactKey(key) ? REDACTED : redactValue(item, depth + 1),
    ])
  );
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(redactValue(value), null, 2);
  } catch {
    return JSON.stringify({ error: 'Unable to stringify WS debug payload' }, null, 2);
  }
}

function truncateJson(json: string) {
  if (json.length <= MAX_JSON_CHARS) {
    return {
      json,
      truncated: false,
    };
  }

  return {
    json: `${json.slice(0, MAX_JSON_CHARS)}\n... [truncated]`,
    truncated: true,
  };
}

function getUtf8ByteLength(value: string) {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      index += 1;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function readTextField(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function getFrameMeta(value: unknown) {
  if (!isObjectRecord(value)) {
    return {
      frame: '',
      type: '',
      requestId: '',
    };
  }

  const event = isObjectRecord(value.event) ? value.event : null;
  return {
    frame: readTextField(value.frame),
    type: readTextField(value.type) || readTextField(event?.type),
    requestId: readTextField(value.id) || readTextField(value.requestId),
  };
}

class WsDebugRecorder {
  private enabled = isInitialCaptureEnabled();
  private mirrorToConsole = IS_DEV;
  private nextRecordId = 1;
  private readonly records: WsDebugRecord[] = [];
  private readonly listeners = new Set<WsDebugListener>();

  getSnapshot(): WsDebugSnapshot {
    return {
      enabled: this.enabled,
      mirrorToConsole: this.mirrorToConsole,
      records: [...this.records],
    };
  }

  subscribe(listener: WsDebugListener) {
    listener(this.getSnapshot());
    if (!IS_DEV) {
      return () => {};
    }

    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setEnabled(enabled: boolean) {
    if (!IS_DEV || this.enabled === enabled) {
      return;
    }

    this.enabled = enabled;
    this.notify();
  }

  setMirrorToConsole(enabled: boolean) {
    if (!IS_DEV || this.mirrorToConsole === enabled) {
      return;
    }

    this.mirrorToConsole = enabled;
    this.notify();
  }

  clear() {
    if (!IS_DEV || this.records.length <= 0) {
      return;
    }

    this.records.splice(0, this.records.length);
    this.notify();
  }

  recordIncomingFrame(frame: unknown, rawPayload?: string) {
    this.record('incoming', frame, rawPayload);
  }

  recordOutgoingFrame(frame: unknown, rawPayload?: string) {
    this.record('outgoing', frame, rawPayload);
  }

  recordStatus(status: string) {
    this.record('status', {
      frame: 'status',
      type: status,
      status,
    });
  }

  recordParseError(rawPayload: string) {
    this.record(
      'parse_error',
      {
        frame: 'parse_error',
        raw: rawPayload,
      },
      rawPayload
    );
  }

  private record(direction: WsDebugDirection, frameValue: unknown, rawPayload?: string) {
    if (!IS_DEV || !this.enabled) {
      return;
    }

    const stringified = safeStringify(frameValue);
    const truncated = truncateJson(stringified);
    const meta = getFrameMeta(frameValue);
    const record: WsDebugRecord = {
      id: this.nextRecordId,
      timestamp: Date.now(),
      direction,
      frame: meta.frame,
      type: meta.type,
      requestId: meta.requestId,
      payloadBytes: getUtf8ByteLength(rawPayload ?? stringified),
      json: truncated.json,
      truncated: truncated.truncated,
    };

    this.nextRecordId += 1;
    this.records.push(record);
    if (this.records.length > MAX_RECORDS) {
      this.records.splice(0, this.records.length - MAX_RECORDS);
    }

    if (this.mirrorToConsole) {
      console.warn('[ws-debug]', direction, record.frame || '-', record.type || '-', record.json);
    }

    this.notify();
  }

  private notify() {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

export const wsDebugRecorder = new WsDebugRecorder();
