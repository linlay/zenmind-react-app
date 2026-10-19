import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { AgentDetailSnapshot } from '../../core/api/services/chatApi';
import {
  readAgentModelOverride,
  type ModelOptionsSnapshot,
  type QueryAccessLevel,
  type QueryModelOverride
} from '../../core/api/services/modelOptionsProtocol';
import { getAccountAuthSnapshot } from '../../core/auth/accountAuth';
import { useT } from '../../shared/i18n';
import { chatSyncService } from '../chatRealtime/chatSyncService';
import type { ChatTimelineState } from '../chatTimeline/types';
import { getChatTimelineRun, resolveChatComposerHistory } from '../chatTimeline/timelineRunAccess';
import {
  classifyAgentAvailabilityError,
  hasValidAgentInteraction,
  resolveAgentInteraction,
  type AgentAvailability
} from './agentInteraction';
import { getChatCacheScopeId } from './cacheScope';
import { getChatSourceFromId } from './chatSource';
import {
  confirmChatComposerSubmission,
  getChatComposerPreferenceRevision,
  readChatComposerPreference,
  rememberChatComposerSubmission,
  subscribeChatComposerPreferences,
  writeChatComposerPreference,
  type ChatComposerPreferenceTarget
} from './chatComposerPreferences';

type AgentState = { key: string; detail: AgentDetailSnapshot | null; availability: AgentAvailability; error: string };
type ModelState = {
  key: string;
  snapshot: ModelOptionsSnapshot | null;
  loading: boolean;
  saving: boolean;
  error: string;
};
const EMPTY_MODEL: QueryModelOverride = {};
const CLOSED_INTERACTION = resolveAgentInteraction(null);

export function useChatComposerSettings({
  conversationId,
  agentKey,
  timeline,
  historyReady,
  isFocused,
  reloadSeed
}: {
  conversationId: string;
  agentKey: string;
  timeline: ChatTimelineState;
  historyReady: boolean;
  isFocused: boolean;
  reloadSeed: number;
}) {
  const t = useT();
  const scope = getChatCacheScopeId();
  const owner =
    getChatSourceFromId(conversationId).kind === 'default'
      ? `cloud:${scope}`
      : `account:${getAccountAuthSnapshot().session?.accountId || ''}`;
  const key = JSON.stringify([owner, scope, conversationId, agentKey]);
  const identity = useRef({ key, version: 0 });
  if (identity.current.key !== key) identity.current = { key, version: identity.current.version + 1 };
  const version = identity.current.version;
  const mounted = useRef(true);
  const modelLoadId = useRef(0);
  const modelSaveId = useRef(0);
  const [agent, setAgent] = useState<AgentState>({ key: '', detail: null, availability: 'checking', error: '' });
  const [models, setModels] = useState<ModelState>({
    key: '',
    snapshot: null,
    loading: false,
    saving: false,
    error: ''
  });
  const [retry, setRetry] = useState(0);
  const preferenceRevision = useSyncExternalStore(
    subscribeChatComposerPreferences,
    getChatComposerPreferenceRevision,
    getChatComposerPreferenceRevision
  );
  const history = useMemo(() => resolveChatComposerHistory(timeline), [timeline]);
  const established = history.established;
  const target = useMemo<ChatComposerPreferenceTarget>(
    () => ({ owner, scope, kind: established ? 'chat' : 'agent', id: established ? conversationId : agentKey }),
    [owner, scope, established, conversationId, agentKey]
  );
  const chatTarget = useMemo<ChatComposerPreferenceTarget>(
    () => ({ owner, scope, kind: 'chat', id: conversationId }),
    [owner, scope, conversationId]
  );
  const preference = readChatComposerPreference(target);
  const agentDetailSnapshot = agent.key === key ? agent.detail : null;
  const agentAvailability = agent.key === key ? agent.availability : 'checking';
  const interaction = useMemo(
    () =>
      agentAvailability === 'available'
        ? resolveAgentInteraction(agentDetailSnapshot?.raw.interactionConfig)
        : CLOSED_INTERACTION,
    [agentAvailability, agentDetailSnapshot]
  );
  const modelOverride =
    preference?.model ?? (established ? history.model : undefined) ?? readAgentModelOverride(agentDetailSnapshot?.raw);
  const accessLevel = preference?.accessLevel ?? (established ? history.accessLevel : undefined) ?? 'default';
  const activeRun = getChatTimelineRun(timeline, timeline.activeRunId);
  const runtimeAccess = useMemo(
    () =>
      activeRun?.isMainRun !== false && activeRun?.lifecycle === 'active'
        ? { runId: activeRun.runId, level: activeRun.accessLevel, phase: activeRun.accessUpdate?.phase }
        : null,
    [activeRun]
  );
  const inputReady = agentAvailability === 'available' && historyReady;
  const isCurrent = useCallback(
    () =>
      mounted.current &&
      identity.current.key === key &&
      identity.current.version === version &&
      getChatCacheScopeId() === scope,
    [key, scope, version]
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isFocused) return;
    let cancelled = false;
    modelSaveId.current++;
    modelLoadId.current++;
    setModels((current) => ({ ...current, saving: false }));
    setAgent({ key, detail: chatSyncService.getAgentDetailSnapshot(agentKey), availability: 'checking', error: '' });
    if (!agentKey) {
      setAgent({ key, detail: null, availability: 'unavailable', error: '' });
      return;
    }
    void chatSyncService
      .ensureAgentDetail(agentKey, { refresh: true, throwOnError: true })
      .then((detail) => {
        if (cancelled || !isCurrent()) return;
        if (detail && !hasValidAgentInteraction(detail.raw.interactionConfig)) {
          setAgent({ key, detail, availability: 'error', error: t('composer.settings.invalidConfig') });
        } else {
          setAgent({ key, detail, availability: detail ? 'available' : 'unavailable', error: '' });
        }
      })
      .catch((error) => {
        if (!cancelled && isCurrent())
          setAgent((current) => ({ ...current, key, availability: classifyAgentAvailabilityError(error), error: '' }));
      });
    return () => {
      cancelled = true;
    };
  }, [agentKey, key, isFocused, reloadSeed, retry, isCurrent, t]);

  const loadModels = useCallback(
    async (refresh = false) => {
      if (!agentKey || !interaction.model || !isCurrent()) return;
      const request = ++modelLoadId.current;
      setModels((current) => ({
        key,
        snapshot: current.key === key ? current.snapshot : chatSyncService.getAgentModelOptionsSnapshot(agentKey),
        loading: true,
        saving: current.key === key && current.saving,
        error: ''
      }));
      try {
        const snapshot = await chatSyncService.ensureAgentModelOptions(agentKey, { refresh });
        if (!isCurrent() || request !== modelLoadId.current) return;
        if (!snapshot) throw new Error(t('composer.query.model.loadFailed'));
        setModels((current) => ({ ...current, snapshot, loading: false, error: '' }));
      } catch (error) {
        if (isCurrent() && request === modelLoadId.current)
          setModels((current) => ({
            ...current,
            loading: false,
            error: error instanceof Error ? error.message : String(error)
          }));
      }
    },
    [agentKey, interaction.model, key, isCurrent, t]
  );
  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  useEffect(() => {
    if (historyReady && established) {
      const confirmedIds = timeline.orderedNodeIds.flatMap((id) => {
        const node = timeline.nodesById[id];
        return node?.kind === 'message' &&
          node.role === 'user' &&
          node.deliveryStatus === 'sent' &&
          node.clientMessageId
          ? [node.clientMessageId]
          : [];
      });
      confirmChatComposerSubmission(chatTarget, confirmedIds);
    }
  }, [historyReady, established, chatTarget, timeline, preferenceRevision]);
  useEffect(() => {
    if (runtimeAccess?.level && !runtimeAccess.phase)
      writeChatComposerPreference(chatTarget, { accessLevel: runtimeAccess.level });
  }, [chatTarget, runtimeAccess?.level, runtimeAccess?.phase]);

  const setAccessLevel = useCallback(
    (value: QueryAccessLevel) => {
      if (inputReady && interaction.accessLevel && isCurrent())
        writeChatComposerPreference(target, { accessLevel: value });
    },
    [inputReady, interaction.accessLevel, isCurrent, target]
  );
  const setModelOverride = useCallback(
    async (value: QueryModelOverride) => {
      if (!inputReady || !interaction.model || runtimeAccess || models.saving || !value.key || !isCurrent()) return;
      if (established) {
        writeChatComposerPreference(target, { model: value });
        return;
      }
      const request = ++modelSaveId.current;
      setModels((current) => ({ ...current, key, saving: true, error: '' }));
      try {
        const saved = await chatSyncService.updateAgentModelConfig(agentKey, value);
        if (!isCurrent() || request !== modelSaveId.current) return;
        if (!saved) throw new Error(t('composer.query.model.saveFailed'));
        writeChatComposerPreference(target, { model: saved });
        setAgent((current) => ({ ...current, detail: chatSyncService.getAgentDetailSnapshot(agentKey) }));
      } catch (error) {
        if (isCurrent() && request === modelSaveId.current)
          setModels((current) => ({ ...current, error: error instanceof Error ? error.message : String(error) }));
      } finally {
        if (isCurrent() && request === modelSaveId.current) setModels((current) => ({ ...current, saving: false }));
      }
    },
    [inputReady, interaction.model, runtimeAccess, models.saving, isCurrent, established, target, agentKey, key, t]
  );
  const captureSubmission = useCallback(
    (targetConversationId = conversationId) => {
      if (!isCurrent() || !inputReady) return () => {};
      return rememberChatComposerSubmission(
        { ...chatTarget, id: targetConversationId },
        {
          accessLevel: interaction.accessLevel ? accessLevel : 'default',
          model: interaction.model ? modelOverride : EMPTY_MODEL
        }
      );
    },
    [
      conversationId,
      chatTarget,
      interaction.accessLevel,
      interaction.model,
      accessLevel,
      modelOverride,
      isCurrent,
      inputReady
    ]
  );
  const retryConfiguration = useCallback(() => setRetry((value) => value + 1), []);
  const refreshModels = useCallback(() => {
    void loadModels(true);
  }, [loadModels]);

  return {
    agentDetailSnapshot,
    agentAvailability,
    configurationError: agent.key === key ? agent.error : '',
    interaction,
    accessLevel,
    modelOverride,
    runtimeAccess,
    inputReady,
    modelOptionsSnapshot: models.key === key ? models.snapshot : null,
    modelOptionsLoading: models.key === key && models.loading,
    modelOptionsError: models.key === key ? models.error : '',
    modelConfigSaving: models.key === key && models.saving,
    submitAccessLevel: interaction.accessLevel ? accessLevel : ('default' as QueryAccessLevel),
    submitModel: interaction.model ? modelOverride : EMPTY_MODEL,
    setAccessLevel,
    setModelOverride,
    captureSubmission,
    retryConfiguration,
    refreshModels
  };
}
