import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { AgentDetailSnapshot } from '../../core/api/services/chatApi';
import {
  readAgentModelOverride,
  isModelOverrideAvailable,
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
import { readComposerConfiguration, saveComposerConfiguration } from './chatRepository';
import { normalizeSkillIds, skillIdentity } from '../../core/api/services/chatSkillsProtocol';
import { getChatCacheScopeId } from './cacheScope';
import { getChatSourceFromId } from './chatSource';
import {
  confirmChatComposerSubmission,
  getChatComposerPreferenceRevision,
  readChatComposerPreference,
  rememberChatComposerSubmission,
  reviseChatComposerSubmissionModel,
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
const EMPTY_SKILLS: string[] = [];
const CLOSED_INTERACTION = resolveAgentInteraction(null);

export function useChatComposerSettings({
  conversationId,
  agentKey,
  timeline,
  history: suppliedHistory,
  historyReady,
  isFocused,
  reloadSeed
}: {
  conversationId: string;
  agentKey: string;
  timeline: ChatTimelineState;
  history?: ReturnType<typeof resolveChatComposerHistory>;
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
  const [stored, setStored] = useState({ key: '', ready: false, error: '' });
  const skillSavePending = useRef<symbol | null>(null);
  const [skillsSaving, setSkillsSaving] = useState(false);
  const [retry, setRetry] = useState(0);
  const preferenceRevision = useSyncExternalStore(
    subscribeChatComposerPreferences,
    getChatComposerPreferenceRevision,
    getChatComposerPreferenceRevision
  );
  const history = useMemo(() => suppliedHistory ?? resolveChatComposerHistory(timeline), [suppliedHistory, timeline]);
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
  const selectedSkills = readChatComposerPreference(chatTarget)?.skillIds ?? EMPTY_SKILLS;
  const agentDetailSnapshot = agent.key === key ? agent.detail : null;
  const agentAvailability = agent.key === key ? agent.availability : 'checking';
  const interaction = useMemo(
    () =>
      agentAvailability === 'available'
        ? resolveAgentInteraction(agentDetailSnapshot?.raw.interactionConfig)
        : CLOSED_INTERACTION,
    [agentAvailability, agentDetailSnapshot]
  );
  const selectedModel =
    preference?.model ?? (established ? history.model : undefined) ?? readAgentModelOverride(agentDetailSnapshot?.raw);
  const { key: modelKey, reasoningEffort, serviceTier } = selectedModel;
  const modelOverride = useMemo(
    () => ({
      ...(modelKey ? { key: modelKey } : {}),
      ...(reasoningEffort ? { reasoningEffort } : {}),
      ...(serviceTier ? { serviceTier } : {})
    }),
    [modelKey, reasoningEffort, serviceTier]
  );
  const accessLevel =
    readChatComposerPreference(chatTarget)?.accessLevel ?? (established ? history.accessLevel : undefined) ?? 'default';
  const activeRun = getChatTimelineRun(timeline, timeline.activeRunId);
  const runtimeAccess = useMemo(
    () =>
      activeRun?.isMainRun !== false && activeRun?.lifecycle === 'active'
        ? {
            runId: activeRun.runId,
            level: activeRun.accessLevel,
            phase: activeRun.accessUpdate?.phase,
            version: activeRun.accessLevelVersion ?? 0
          }
        : null,
    [activeRun]
  );
  const inputReady = agentAvailability === 'available' && historyReady && stored.key === key && stored.ready;
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

  useEffect(() => {
    let cancelled = false;
    skillSavePending.current = null;
    setSkillsSaving(false);
    setStored({ key, ready: false, error: '' });
    void readComposerConfiguration(chatTarget)
      .then(async (value) => {
        if (cancelled || !isCurrent()) return;
        const local = readChatComposerPreference(chatTarget);
        if (local?.model && !value?.model) {
          await saveComposerConfiguration(chatTarget, { model: local.model }, true);
          if (cancelled || !isCurrent()) return;
        }
        if (value) writeChatComposerPreference(chatTarget, { ...value, ...readChatComposerPreference(chatTarget) });
        setStored({ key, ready: true, error: '' });
      })
      .catch((error) => {
        if (!cancelled && isCurrent()) setStored({ key, ready: false, error: String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [chatTarget, isCurrent, key, retry]);

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
    if (inputReady && established) {
      const confirmedIds = timeline.orderedNodeIds.flatMap((id) => {
        const node = timeline.nodesById[id];
        return node?.kind === 'message' &&
          node.role === 'user' &&
          node.deliveryStatus === 'sent' &&
          node.clientMessageId
          ? [node.clientMessageId]
          : [];
      });
      const confirmed = confirmChatComposerSubmission(chatTarget, confirmedIds);
      if (confirmed?.model)
        void saveComposerConfiguration(chatTarget, { model: confirmed.model }, true).catch((error) => {
          if (isCurrent()) setStored((current) => ({ ...current, error: String(error) }));
        });
    }
  }, [inputReady, established, chatTarget, timeline, preferenceRevision, isCurrent]);
  const observedAccess = useRef(runtimeAccess);
  useEffect(() => {
    const previous = observedAccess.current;
    observedAccess.current = runtimeAccess;
    if (
      runtimeAccess?.level &&
      !runtimeAccess.phase &&
      previous?.runId === runtimeAccess.runId &&
      runtimeAccess.version > previous.version
    )
      writeChatComposerPreference(chatTarget, { accessLevel: runtimeAccess.level });
  }, [chatTarget, runtimeAccess]);

  const setAccessLevel = useCallback(
    (value: QueryAccessLevel) => {
      if (inputReady && interaction.accessLevel && isCurrent())
        writeChatComposerPreference(chatTarget, { accessLevel: value });
    },
    [inputReady, interaction.accessLevel, isCurrent, chatTarget]
  );
  const setModelOverride = useCallback(
    async (value: QueryModelOverride) => {
      if (!inputReady || !interaction.model || models.saving || !isCurrent()) return false;
      if (!models.snapshot || !isModelOverrideAvailable(value, models.snapshot)) {
        setModels((current) => ({ ...current, error: t('composer.query.model.selectedUnavailable') }));
        return false;
      }
      const request = ++modelSaveId.current;
      setModels((current) => ({ ...current, key, saving: true, error: '' }));
      try {
        const saved = established ? value : await chatSyncService.updateAgentModelConfig(agentKey, value);
        if (!isCurrent() || request !== modelSaveId.current) return false;
        if (!saved) throw new Error(t('composer.query.model.saveFailed'));
        if (established) await saveComposerConfiguration(chatTarget, { model: saved });
        if (!isCurrent() || request !== modelSaveId.current) return false;
        writeChatComposerPreference(target, { model: saved });
        if (!established) reviseChatComposerSubmissionModel(chatTarget, saved);
        // Confirmation may have established the Chat while Agent-default saving was in flight.
        if (!established && readChatComposerPreference(chatTarget)?.model) {
          await saveComposerConfiguration(chatTarget, { model: saved });
          if (isCurrent()) writeChatComposerPreference(chatTarget, { model: saved });
        }
        setAgent((current) => ({ ...current, detail: chatSyncService.getAgentDetailSnapshot(agentKey) }));
        return true;
      } catch (error) {
        if (isCurrent() && request === modelSaveId.current)
          setModels((current) => ({ ...current, error: error instanceof Error ? error.message : String(error) }));
        return false;
      } finally {
        if (isCurrent() && request === modelSaveId.current) setModels((current) => ({ ...current, saving: false }));
      }
    },
    [
      inputReady,
      interaction.model,
      models.saving,
      models.snapshot,
      isCurrent,
      established,
      target,
      chatTarget,
      agentKey,
      key,
      t
    ]
  );
  const setSelectedSkills = useCallback(
    async (ids: readonly string[]) => {
      if (!inputReady || !isCurrent() || skillSavePending.current) return;
      const existingIds = new Set(selectedSkills.map(skillIdentity));
      if (!interaction.attachment.skills && ids.some((id) => !existingIds.has(skillIdentity(id)))) return;
      const token = Symbol();
      skillSavePending.current = token;
      setSkillsSaving(true);
      try {
        const skillIds = normalizeSkillIds(ids);
        await saveComposerConfiguration(chatTarget, { skillIds });
        if (isCurrent()) writeChatComposerPreference(chatTarget, { skillIds });
      } catch (error) {
        if (isCurrent()) setStored((current) => ({ ...current, error: String(error) }));
      } finally {
        if (skillSavePending.current === token) {
          skillSavePending.current = null;
          if (isCurrent()) setSkillsSaving(false);
        }
      }
    },
    [chatTarget, inputReady, interaction.attachment.skills, isCurrent, selectedSkills]
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
    configurationError: (agent.key === key ? agent.error : '') || (stored.key === key ? stored.error : ''),
    selectedSkills,
    setSelectedSkills,
    skillsSaving,
    settingsKey: key,
    interaction,
    accessLevel,
    modelOverride,
    runtimeAccess,
    inputReady,
    modelOptionsSnapshot: models.key === key ? models.snapshot : null,
    modelOptionsLoading: models.key === key && models.loading,
    modelOptionsError:
      models.key === key
        ? models.error ||
          (interaction.model && models.snapshot && !isModelOverrideAvailable(modelOverride, models.snapshot)
            ? t('composer.query.model.selectedUnavailable')
            : '')
        : '',
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
