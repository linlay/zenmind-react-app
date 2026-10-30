import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { AwaitingSubmitPayloadData } from '../../../../core/api/services/chatApi';
import { useT } from '../../../../shared/i18n';
import type { ChatConversationAwaitingState } from '../../../chatRealtime/types';
import { getAwaitingInteractiveTimeout, type ChatTimelineAwaitingInteractive } from '../../../chatTimeline/index.ts';
import { buildConversationViewDocumentKey } from '../../conversationViewport/viewportDocument';
import { useConversationViewChatId } from '../../conversationViewport/ConversationViewScope';
import { AwaitingFormViewport } from './AwaitingFormViewport';
import type { AwaitingFormViewportHandle } from './AwaitingFormViewportTypes';
import { AwaitingPanelFooter } from './AwaitingPanelFooter';
import { buildAwaitingSubmitPayload } from './awaitingSubmitState';

type AwaitingFormPanelProps = {
  awaiting: ChatConversationAwaitingState & { interactive: Extract<ChatTimelineAwaitingInteractive, { kind: 'form' }> };
  disabled: boolean;
  submitting: boolean;
  submitPayload: (payload: AwaitingSubmitPayloadData) => void;
};

export function AwaitingFormPanel({ awaiting, disabled, submitting, submitPayload }: AwaitingFormPanelProps) {
  const t = useT();
  const chatId = useConversationViewChatId();
  const viewportRef = useRef<AwaitingFormViewportHandle | null>(null);
  const generationRef = useRef(0);
  const collectingRef = useRef(false);
  const [collecting, setCollecting] = useState(false);
  const [errorText, setErrorText] = useState('');
  const { form, view, viewError } = awaiting.interactive;
  const documentKey =
    view && !viewError && view.renderer !== 'native' ? buildConversationViewDocumentKey(chatId, view, 'form') : '';
  const timeoutMs = getAwaitingInteractiveTimeout(awaiting.interactive);

  useEffect(() => {
    generationRef.current += 1;
    collectingRef.current = false;
    setCollecting(false);
    setErrorText('');
    return () => {
      generationRef.current += 1;
    };
  }, [awaiting.id, awaiting.runId, documentKey]);

  const approve = async () => {
    if (disabled || submitting || collectingRef.current) return;
    const generation = generationRef.current;
    collectingRef.current = true;
    setCollecting(true);
    setErrorText('');
    try {
      const param = await viewportRef.current?.collect();
      if (generationRef.current !== generation) return;
      if (!param) throw new Error(t('awaiting.error.viewportNotReady'));
      submitPayload(buildAwaitingSubmitPayload(awaiting, { kind: 'form', ...param }));
    } catch (error) {
      if (generationRef.current === generation) setErrorText(error instanceof Error ? error.message : String(error));
    } finally {
      if (generationRef.current === generation) {
        collectingRef.current = false;
        setCollecting(false);
      }
    }
  };

  return (
    <>
      <View className="gap-1">
        <Text allowFontScaling={false} className="text-[15px] font-extrabold leading-[21px] text-app-primary">
          {form.title || awaiting.prompt || t('awaiting.form.title')}
        </Text>
      </View>
      {documentKey ? (
        <AwaitingFormViewport
          key={`${awaiting.id}:${documentKey}`}
          ref={viewportRef}
          awaiting={awaiting}
          disabled={disabled || submitting}
          documentKey={documentKey}
          onError={setErrorText}
        />
      ) : (
        <Text selectable className="text-[12px] text-app-secondary">
          {viewError || t('awaiting.form.viewportUnavailable')}
        </Text>
      )}
      <AwaitingPanelFooter
        awaiting={awaiting}
        disabled={disabled || collecting}
        errorText={errorText}
        primaryLabel={t('awaiting.approve')}
        secondaryLabel={t('awaiting.reject')}
        submitting={submitting || collecting}
        timeoutMs={timeoutMs}
        onPrimary={approve}
        onSecondary={() => submitPayload(buildAwaitingSubmitPayload(awaiting, { kind: 'form', decision: 'reject' }))}
      />
    </>
  );
}
