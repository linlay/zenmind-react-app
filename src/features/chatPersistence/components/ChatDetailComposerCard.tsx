import { skillIdentity, type ChatSkillsCatalog } from '../../../core/api/services/chatSkillsProtocol';
import type { ChatPendingSteer } from '../../chatRealtime/types';
import { useT } from '../../../shared/i18n';
import type { AgentInteraction } from '../agentInteraction';
import { memo, useState, type RefObject } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { ChatComposerAttachment } from '../types';
import { Composer, type ComposerAttachmentType } from './Composer';
import type { ChatComposerPrimaryAction } from '../chatDetailViewModel';
import { ChatComposerOptionRow } from './ChatComposerOptionRow';
import { ChatAttachmentStrip } from './ChatAttachmentStrip';
import { AppIcon } from '../../../shared/icons/AppIcon';
import type { ChatComposerDraft, ComposerTextEdit } from '../chatComposerDraft';
import type { ComposerTextInputHandle } from './ComposerTextInput.types';
import { ChatPastedTextEditor } from './ChatPastedTextEditor';
import type {
  ModelOptionsSnapshot,
  QueryAccessLevel,
  QueryModelOverride
} from '../../../core/api/services/modelOptionsProtocol';

const COMPOSER_WRAP_CLASS = 'bg-app-background px-app-md pb-[6px] pt-[5px]';
const ERROR_TEXT_CLASS = 'mt-app-sm px-app-md text-[13px] leading-[20px] text-app-danger';

type ChatComposerOptionsState = {
  settingsKey: string;
  interaction: AgentInteraction;
  runtimeAccess: { runId: string; level?: QueryAccessLevel; phase?: 'sending' | 'unknown' } | null;
  onRuntimeAccessChange: (level: QueryAccessLevel) => void;
  onRuntimeAccessRefresh: () => void;
  skillsCatalog: ChatSkillsCatalog | null;
  selectedSkills: readonly string[];
  skillsLoading: boolean;
  skillsError: string;
  onLoadSkills: () => void;
  onToggleSkills: (ids: readonly string[]) => void;
  accessLevel: QueryAccessLevel;
  agentKey: string;
  modelOverride: QueryModelOverride;
  modelOptionsError: string;
  modelConfigSaving: boolean;
  inputReady: boolean;
  localFilesAllowed: boolean;
  onRefreshModels: () => void;
  modelOptionsLoading: boolean;
  modelOptionsSnapshot: ModelOptionsSnapshot | null;
};

type ChatDetailComposerCardProps = {
  composerRef: RefObject<ComposerTextInputHandle | null>;
  draft: ChatComposerDraft;
  pendingSteers: readonly ChatPendingSteer[];
  steerAvailable: boolean;
  steerRunId: string;
  onQueueSteer: () => void;
  onSteer: (steerId: string) => void;
  onRestoreSteer: (steerId: string) => void;
  attachments: ChatComposerAttachment[];
  composerOptions: ChatComposerOptionsState;
  errorText: string;
  recoveryText?: string;
  planModeAvailable: boolean;
  planModeEnabled: boolean;
  editingModeAvailable: boolean;
  editingModeEnabled: boolean;
  onToggleEditingMode: () => void;
  primaryAction: ChatComposerPrimaryAction;
  onEdit: (edit: ComposerTextEdit) => void;
  onEditPaste: (id: string, text: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onResume: () => void;
  onTogglePlanMode: () => void;
  onOpenChatReferences?: () => void;
  onOpenKbaseReferences?: () => void;
  onSelectAttachment: (type: ComposerAttachmentType) => void;
  onRemoveAttachment: (attachmentId: string) => void;
  onRetryAttachment: (attachmentId: string) => void;
  onUpdateSelectionAnnotation?: (attachmentId: string, annotation: string) => void;
  onAccessLevelChange: (value: QueryAccessLevel) => void;
  onModelOverrideChange: (value: QueryModelOverride) => Promise<boolean>;
};

export const ChatDetailComposerCard = memo(function ChatDetailComposerCard({
  composerRef,
  draft,
  pendingSteers,
  steerAvailable,
  steerRunId,
  onQueueSteer,
  onSteer,
  onRestoreSteer,
  attachments,
  composerOptions,
  errorText,
  recoveryText,
  planModeAvailable,
  planModeEnabled,
  editingModeAvailable,
  editingModeEnabled,
  onToggleEditingMode,
  primaryAction,
  onEdit,
  onEditPaste,
  onSubmit,
  onStop,
  onResume,
  onTogglePlanMode,
  onOpenChatReferences,
  onOpenKbaseReferences,
  onSelectAttachment,
  onRemoveAttachment,
  onRetryAttachment,
  onUpdateSelectionAnnotation,
  onAccessLevelChange,
  onModelOverrideChange
}: ChatDetailComposerCardProps) {
  const t = useT();
  const [editingPaste, setEditingPaste] = useState<{ id: string; text: string } | null>(null);
  const focusComposer = () => composerRef.current?.focus();
  const closeEditor = () => {
    setEditingPaste(null);
    requestAnimationFrame(focusComposer);
  };
  const toolbar = (
    <ChatComposerOptionRow
      key={composerOptions.settingsKey}
      localFilesAllowed={composerOptions.localFilesAllowed}
      onSelectAttachment={onSelectAttachment}
      onOpenChatReferences={onOpenChatReferences}
      onOpenKbaseReferences={onOpenKbaseReferences}
      planModeAvailable={planModeAvailable}
      planModeEnabled={planModeEnabled}
      editingModeAvailable={editingModeAvailable}
      editingModeEnabled={editingModeEnabled}
      queryModeDisabled={
        steerAvailable || Boolean(composerOptions.runtimeAccess) || ['sending', 'resume'].includes(primaryAction)
      }
      onTogglePlanMode={onTogglePlanMode}
      onToggleEditingMode={onToggleEditingMode}
      skillsEnabled={composerOptions.interaction.attachment.skills && Boolean(composerOptions.agentKey)}
      skillsDisabled={composerOptions.skillsLoading || ['sending', 'resume'].includes(primaryAction)}
      skillsCatalog={composerOptions.skillsCatalog}
      selectedSkills={composerOptions.selectedSkills}
      skillsLoading={composerOptions.skillsLoading}
      skillsError={composerOptions.skillsError}
      onLoadSkills={composerOptions.onLoadSkills}
      onToggleSkills={composerOptions.onToggleSkills}
      disabled={!composerOptions.inputReady || primaryAction === 'sending'}
      modelDisabled={composerOptions.modelConfigSaving}
      modelOptionsError={composerOptions.modelOptionsError}
      onRefreshModels={composerOptions.onRefreshModels}
      modelEnabled={composerOptions.interaction.model}
      accessLevelEnabled={composerOptions.interaction.accessLevel}
      runtimeAccess={composerOptions.runtimeAccess}
      onRuntimeAccessChange={composerOptions.onRuntimeAccessChange}
      onRuntimeAccessRefresh={composerOptions.onRuntimeAccessRefresh}
      accessLevel={composerOptions.accessLevel}
      agentKey={composerOptions.agentKey}
      modelOverride={composerOptions.modelOverride}
      modelOptionsLoading={composerOptions.modelOptionsLoading}
      modelOptionsSnapshot={composerOptions.modelOptionsSnapshot}
      onAccessLevelChange={onAccessLevelChange}
      onModelOverrideChange={onModelOverrideChange}
    />
  );
  return (
    <View className={COMPOSER_WRAP_CLASS}>
      {pendingSteers.length ? (
        <ScrollView
          className="max-h-[174px] mb-app-xs rounded-app-md border border-app-line bg-app-surface-muted"
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
        >
          {pendingSteers.map((pendingSteer) => (
            <View key={pendingSteer.steerId} className="flex-row items-start gap-app-sm px-app-sm py-app-sm">
              <AppIcon usage="timeline.requestCommandRail" size={18} />
              <View className="min-w-0 flex-1 gap-app-xs">
                <Text numberOfLines={2} className="text-[13px] text-app-primary">
                  {pendingSteer.message || pendingSteer.attachments.map((item) => item.name).join(', ')}
                </Text>
                <Text className="text-[13px] text-app-secondary">
                  {t(
                    pendingSteer.phase === 'queued'
                      ? pendingSteer.runEnded
                        ? 'chatDetail.steer.queuedRunEnded'
                        : 'chatDetail.steer.queued'
                      : pendingSteer.phase === 'failed'
                        ? 'chatDetail.steer.rejected'
                        : pendingSteer.runEnded
                          ? 'chatDetail.steer.runEnded'
                          : pendingSteer.phase === 'sending'
                            ? 'chatDetail.steer.sending'
                            : pendingSteer.phase === 'accepted'
                              ? 'chatDetail.steer.accepted'
                              : 'chatDetail.steer.unknown'
                  )}
                </Text>
                {pendingSteer.error ? <Text className="text-[13px] text-app-danger">{pendingSteer.error}</Text> : null}
                {pendingSteer.phase !== 'queued' &&
                pendingSteer.phase !== 'sending' &&
                (pendingSteer.phase === 'failed' || pendingSteer.runEnded) ? (
                  <Pressable onPress={() => onRestoreSteer(pendingSteer.steerId)} accessibilityRole="button">
                    <Text className="text-[13px] text-app-brand-blue">{t('chatDetail.steer.restore')}</Text>
                  </Pressable>
                ) : null}
              </View>
              {pendingSteer.phase === 'queued' ? (
                <View className="flex-row items-center gap-app-xs">
                  <Pressable
                    onPress={() => onSteer(pendingSteer.steerId)}
                    accessibilityRole="button"
                    accessibilityLabel={t('composer.steer')}
                    accessibilityState={{ disabled: pendingSteer.runEnded || pendingSteer.runId !== steerRunId }}
                    disabled={pendingSteer.runEnded || pendingSteer.runId !== steerRunId}
                    className="min-h-[44px] justify-center rounded-app-sm bg-app-surface px-app-sm disabled:opacity-40"
                  >
                    <Text className="text-[13px] text-app-brand-blue">{t('chatDetail.steer.submit')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => onRestoreSteer(pendingSteer.steerId)}
                    accessibilityRole="button"
                    className="min-h-[44px] justify-center px-app-sm"
                  >
                    <Text className="text-[13px] text-app-secondary">{t('common.cancel')}</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))}
        </ScrollView>
      ) : null}
      {recoveryText ? <Text className="mb-app-sm text-[13px] text-app-secondary">{recoveryText}</Text> : null}
      <Composer
        ref={composerRef}
        value={draft.input}
        onEdit={onEdit}
        primaryAction={primaryAction}
        onSubmit={steerAvailable ? onQueueSteer : onSubmit}
        onStop={onStop}
        onResume={onResume}
        inputDisabled={!composerOptions.inputReady}
        toolbar={toolbar}
        content={
          <ChatAttachmentStrip
            attachments={attachments}
            variant="composer"
            onRemoveAttachment={onRemoveAttachment}
            onRetryAttachment={onRetryAttachment}
            onUpdateSelectionAnnotation={onUpdateSelectionAnnotation}
          >
            {draft.pastes.map((paste) => (
              <View
                key={paste.id}
                className="h-[58px] max-w-[184px] flex-row items-center gap-app-xs rounded-app-md border border-app-line bg-app-surface px-app-sm"
              >
                <Pressable
                  onPress={() => setEditingPaste({ id: paste.id, text: paste.text })}
                  accessibilityRole="button"
                  accessibilityLabel={t('composer.paste.edit')}
                  className="min-w-0 flex-1 flex-row items-center gap-app-xs"
                >
                  <AppIcon usage="attachment.fileText" size={18} />
                  <Text numberOfLines={2} className="min-w-0 shrink text-[13px] text-app-primary">
                    {t('composer.paste.label')} · {t('composer.paste.characters', { count: paste.text.length })}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => onEditPaste(paste.id, '')}
                  accessibilityRole="button"
                  accessibilityLabel={t('composer.paste.remove')}
                  className="py-app-sm"
                >
                  <AppIcon usage="attachment.remove" size={16} />
                </Pressable>
              </View>
            ))}
            {composerOptions.selectedSkills.length
              ? composerOptions.selectedSkills.map((id) => {
                  const label =
                    composerOptions.skillsCatalog?.skills.find((skill) => skillIdentity(skill.id) === skillIdentity(id))
                      ?.label || id;
                  return (
                    <Pressable
                      key={id}
                      accessibilityRole="button"
                      accessibilityLabel={`${label} · ${t('composer.skills.remove')}`}
                      disabled={composerOptions.skillsLoading || ['sending', 'resume'].includes(primaryAction)}
                      onPress={() => composerOptions.onToggleSkills([id])}
                      className="h-[58px] max-w-[184px] flex-row items-center gap-app-xs rounded-app-md border border-app-line bg-app-surface px-app-sm"
                    >
                      <AppIcon usage="composer.skills" size={18} />
                      <Text numberOfLines={1} className="min-w-0 shrink text-[13px] text-app-primary">
                        {label}
                      </Text>
                      <AppIcon usage="attachment.remove" size={16} />
                    </Pressable>
                  );
                })
              : null}
          </ChatAttachmentStrip>
        }
      />
      {editingPaste ? (
        <ChatPastedTextEditor
          key={editingPaste.id}
          text={editingPaste.text}
          onClose={closeEditor}
          onDismiss={focusComposer}
          onSave={(text) => {
            onEditPaste(editingPaste.id, text);
            closeEditor();
          }}
        />
      ) : null}
      {composerOptions.inputReady &&
      !composerOptions.interaction.attachment.localFiles &&
      attachments.some((item) => item.kind === 'file' || item.kind === 'image') ? (
        <Text className={ERROR_TEXT_CLASS}>{t('composer.settings.filesForbidden')}</Text>
      ) : null}
      {errorText ? (
        <Text allowFontScaling={false} className={ERROR_TEXT_CLASS}>
          {errorText}
        </Text>
      ) : null}
    </View>
  );
});
