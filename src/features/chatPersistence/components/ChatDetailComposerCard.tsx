import type { ChatSkillsCatalog } from '../../../core/api/services/chatSkillsProtocol';
import type { ChatPendingSteer } from '../../chatRealtime/types';
import { useT } from '../../../shared/i18n';
import type { AgentInteraction } from '../agentInteraction';
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { ChatComposerAttachment } from '../types';
import { Composer, type ComposerAttachmentType } from './Composer';
import type { ChatComposerPrimaryAction } from '../chatDetailViewModel';
import { ChatComposerOptionRow } from './ChatComposerOptionRow';
import type {
  ModelOptionsSnapshot,
  QueryAccessLevel,
  QueryModelOverride
} from '../../../core/api/services/modelOptionsProtocol';

const COMPOSER_WRAP_CLASS = 'bg-app-background px-app-md pb-[6px] pt-[5px]';
const ERROR_TEXT_CLASS = 'mt-app-sm px-app-md text-[13px] leading-[20px] text-app-danger';

type ChatComposerOptionsState = {
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
  draft: string;
  pendingSteer: ChatPendingSteer | null;
  steerAvailable: boolean;
  onSteer: () => void;
  onRestoreSteer: () => void;
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
  onChangeDraft: (value: string) => void;
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
  onModelOverrideChange: (value: QueryModelOverride) => void;
};

export const ChatDetailComposerCard = memo(function ChatDetailComposerCard({
  draft,
  pendingSteer,
  steerAvailable,
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
  onChangeDraft,
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
  return (
    <View className={COMPOSER_WRAP_CLASS}>
      <ChatComposerOptionRow
        skillsEnabled={composerOptions.interaction.attachment.skills && Boolean(composerOptions.agentKey)}
        skillsDisabled={Boolean(pendingSteer) || ['stop', 'sending', 'resume'].includes(primaryAction)}
        skillsCatalog={composerOptions.skillsCatalog}
        selectedSkills={composerOptions.selectedSkills}
        skillsLoading={composerOptions.skillsLoading}
        skillsError={composerOptions.skillsError}
        onLoadSkills={composerOptions.onLoadSkills}
        onToggleSkills={composerOptions.onToggleSkills}
        disabled={!composerOptions.inputReady || Boolean(pendingSteer) || primaryAction === 'sending'}
        modelDisabled={composerOptions.modelConfigSaving || ['stop', 'resume'].includes(primaryAction)}
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
      {pendingSteer ? (
        <View className="mb-app-sm gap-app-xs">
          <Text className="text-[13px] text-app-secondary">
            {t(
              pendingSteer.runEnded
                ? 'chatDetail.steer.runEnded'
                : pendingSteer.phase === 'sending'
                  ? 'chatDetail.steer.sending'
                  : pendingSteer.phase === 'accepted'
                    ? 'chatDetail.steer.accepted'
                    : 'chatDetail.steer.unknown'
            )}
          </Text>
          {pendingSteer.phase !== 'sending' ? (
            <Pressable onPress={onRestoreSteer} accessibilityRole="button">
              <Text className="text-[13px] text-app-brand-blue">{t('chatDetail.steer.restore')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {recoveryText ? <Text className="mb-app-sm text-[13px] text-app-secondary">{recoveryText}</Text> : null}
      <Composer
        inputDisabled={Boolean(pendingSteer)}
        steerAvailable={steerAvailable}
        onSteer={onSteer}
        onOpenChatReferences={onOpenChatReferences}
        onOpenKbaseReferences={onOpenKbaseReferences}
        attachmentEnabled={composerOptions.localFilesAllowed}
        value={draft}
        attachments={attachments}
        onChangeText={onChangeDraft}
        primaryAction={primaryAction}
        onSubmit={onSubmit}
        onStop={onStop}
        onResume={onResume}
        onSelectAttachment={onSelectAttachment}
        onRemoveAttachment={onRemoveAttachment}
        onRetryAttachment={onRetryAttachment}
        onUpdateSelectionAnnotation={onUpdateSelectionAnnotation}
        planModeAvailable={planModeAvailable || editingModeAvailable}
        planModeEnabled={editingModeAvailable ? editingModeEnabled : planModeEnabled}
        queryModeLabel={editingModeAvailable ? t('composer.editingMode') : t('composer.planMode')}
        queryModeIconUsage={editingModeAvailable ? 'composer.edit' : 'composer.plan'}
        queryModeDisabled={Boolean(pendingSteer) || ['stop', 'sending', 'resume'].includes(primaryAction)}
        onTogglePlanMode={editingModeAvailable ? onToggleEditingMode : onTogglePlanMode}
      />
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
