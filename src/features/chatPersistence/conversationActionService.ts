import {
  normalizeConversationActionArguments,
  readConversationActionEventArguments,
  resolveChatTimelineActionId,
  resolveConversationActionEventName,
  resolveConversationActionDefinition,
  type ChatTimelineActionExecutorKind
} from '../chatTimeline/index.ts';

export type ConversationActionCapabilities = {
  setTheme: (theme: 'light' | 'dark') => void;
};

export type ConversationActionExecutionResult = {
  actionId: string;
  actionName: string;
  duplicate: boolean;
  status: 'executed' | 'blocked' | 'failed';
  result: Record<string, unknown> | null;
  reason: string;
};

type ActionBuffer = {
  actionName: string;
  argsText: string;
};

type ActionExecutor = (
  args: Record<string, unknown>,
  capabilities: ConversationActionCapabilities
) => Record<string, unknown>;

const MAX_EXECUTION_CACHE_ENTRIES = 128;
const MAX_ACTION_BUFFER_ENTRIES = 128;

const ACTION_EXECUTORS: Readonly<Record<ChatTimelineActionExecutorKind, ActionExecutor>> = Object.freeze({
  theme: (args, capabilities) => {
    const theme = args.theme === 'dark' ? 'dark' : 'light';
    capabilities.setTheme(theme);
    return { theme };
  }
});

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseArgs(value: string): Record<string, unknown> | null {
  if (!value.trim()) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function actionKey(conversationId: string, actionId: string): string {
  return `${conversationId}:${actionId}`;
}

export class ConversationActionService {
  private readonly buffers = new Map<string, ActionBuffer>();
  private readonly executions = new Map<string, Promise<ConversationActionExecutionResult>>();

  resetConversationBuffers(conversationIdInput: string): void {
    const prefix = `${text(conversationIdInput)}:`;
    for (const key of this.buffers.keys()) {
      if (key.startsWith(prefix)) {
        this.buffers.delete(key);
      }
    }
  }

  async handleProtocolEvent(
    conversationIdInput: string,
    event: Record<string, unknown>,
    capabilities: ConversationActionCapabilities
  ): Promise<ConversationActionExecutionResult | null> {
    const conversationId = text(conversationIdInput);
    const type = text(event.type).toLowerCase();
    const actionId = resolveChatTimelineActionId(event);
    if (!conversationId || !type.startsWith('action.') || !actionId) {
      return null;
    }

    const key = actionKey(conversationId, actionId);
    const current = this.buffers.get(key) ?? { actionName: '', argsText: '' };
    const eventActionName = resolveConversationActionEventName(event);
    if (eventActionName) {
      current.actionName = eventActionName;
    }

    if (type === 'action.args') {
      current.argsText += typeof event.delta === 'string' ? event.delta : '';
      this.setBuffer(key, current);
      return null;
    }

    if (type === 'action.start') {
      this.setBuffer(key, current);
      const directArgs = readConversationActionEventArguments(event);
      return directArgs ? this.execute(conversationId, actionId, current.actionName, directArgs, capabilities) : null;
    }

    if (type !== 'action.snapshot' && type !== 'action.end') {
      return null;
    }

    this.buffers.delete(key);
    const directArgs = readConversationActionEventArguments(event);
    const definition = resolveConversationActionDefinition(current.actionName || 'unknown');
    if (definition.policy !== 'allowed') {
      return this.execute(conversationId, actionId, current.actionName, directArgs ?? {}, capabilities);
    }
    const args = directArgs ?? parseArgs(current.argsText);
    if (!args) {
      return {
        actionId,
        actionName: current.actionName || 'unknown',
        duplicate: false,
        status: 'failed',
        result: null,
        reason: 'invalid_arguments'
      };
    }
    return this.execute(conversationId, actionId, current.actionName, args, capabilities);
  }

  private execute(
    conversationId: string,
    actionId: string,
    actionNameInput: string,
    rawArgs: Record<string, unknown>,
    capabilities: ConversationActionCapabilities
  ): Promise<ConversationActionExecutionResult> {
    const key = actionKey(conversationId, actionId);
    const existing = this.executions.get(key);
    if (existing) {
      return existing.then((result) => ({ ...result, duplicate: true }));
    }

    const actionName = text(actionNameInput).toLowerCase() || 'unknown';
    const definition = resolveConversationActionDefinition(actionName);
    const execution = Promise.resolve().then<ConversationActionExecutionResult>(() => {
      if (definition.policy !== 'allowed' || !definition.executorKind) {
        return {
          actionId,
          actionName,
          duplicate: false,
          status: 'blocked',
          result: null,
          reason: definition.policyReason
        };
      }
      const executor = ACTION_EXECUTORS[definition.executorKind];
      if (!executor) {
        return {
          actionId,
          actionName,
          duplicate: false,
          status: 'blocked',
          result: null,
          reason: 'executor_unavailable'
        };
      }
      try {
        const args = normalizeConversationActionArguments(actionName, rawArgs);
        return {
          actionId,
          actionName,
          duplicate: false,
          status: 'executed',
          result: executor(args, capabilities),
          reason: ''
        };
      } catch (error) {
        return {
          actionId,
          actionName,
          duplicate: false,
          status: 'failed',
          result: null,
          reason: error instanceof Error ? error.message : String(error)
        };
      }
    });
    this.executions.set(key, execution);
    this.trimExecutionCache();
    return execution;
  }

  private setBuffer(key: string, buffer: ActionBuffer): void {
    if (!this.buffers.has(key) && this.buffers.size >= MAX_ACTION_BUFFER_ENTRIES) {
      const oldestKey = this.buffers.keys().next().value as string | undefined;
      if (oldestKey) {
        this.buffers.delete(oldestKey);
      }
    }
    this.buffers.set(key, buffer);
  }

  private trimExecutionCache(): void {
    while (this.executions.size > MAX_EXECUTION_CACHE_ENTRIES) {
      const oldestKey = this.executions.keys().next().value as string | undefined;
      if (!oldestKey) {
        return;
      }
      this.executions.delete(oldestKey);
    }
  }
}

export const conversationActionService = new ConversationActionService();
