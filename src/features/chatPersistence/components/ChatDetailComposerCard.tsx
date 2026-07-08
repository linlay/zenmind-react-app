import { memo } from 'react';
import { Text, View } from 'react-native';

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
  accessLevel: QueryAccessLevel;
  agentKey: string;
  modelOverride: QueryModelOverride;
  modelOptionsLoading: boolean;
  modelOptionsSnapshot: ModelOptionsSnapshot | null;
};

type ChatDetailComposerCardProps = {
  draft: string;
  attachments: ChatComposerAttachment[];
  composerOptions: ChatComposerOptionsState;
  errorText: string;
  planModeAvailable: boolean;
  planModeEnabled: boolean;
  primaryAction: ChatComposerPrimaryAction;
  onChangeDraft: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onResume: () => void;
  onTogglePlanMode: () => void;
  onSelectAttachment: (type: ComposerAttachmentType) => void;
  onRemoveAttachment: (attachmentId: string) => void;
  onRetryAttachment: (attachmentId: string) => void;
  onAccessLevelChange: (value: QueryAccessLevel) => void;
  onModelOverrideChange: (value: QueryModelOverride) => void;
};

export const ChatDetailComposerCard = memo(function ChatDetailComposerCard({
  draft,
  attachments,
  composerOptions,
  errorText,
  planModeAvailable,
  planModeEnabled,
  primaryAction,
  onChangeDraft,
  onSubmit,
  onStop,
  onResume,
  onTogglePlanMode,
  onSelectAttachment,
  onRemoveAttachment,
  onRetryAttachment,
  onAccessLevelChange,
  onModelOverrideChange,
}: ChatDetailComposerCardProps) {
  return (
    <View className={COMPOSER_WRAP_CLASS}>
      <ChatComposerOptionRow
        accessLevel={composerOptions.accessLevel}
        agentKey={composerOptions.agentKey}
        modelOverride={composerOptions.modelOverride}
        modelOptionsLoading={composerOptions.modelOptionsLoading}
        modelOptionsSnapshot={composerOptions.modelOptionsSnapshot}
        onAccessLevelChange={onAccessLevelChange}
        onModelOverrideChange={onModelOverrideChange}
      />
      <Composer
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
        planModeAvailable={planModeAvailable}
        planModeEnabled={planModeEnabled}
        onTogglePlanMode={onTogglePlanMode}
      />
      {errorText ? (
        <Text allowFontScaling={false} className={ERROR_TEXT_CLASS}>
          {errorText}
        </Text>
      ) : null}
    </View>
  );
});
