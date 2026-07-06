import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { AwaitingSubmitParamData, AwaitingSubmitPayloadData } from '../../../../core/api/services/chatApi';
import { useT } from '../../../../shared/i18n';
import { cn } from '../../../../shared/visual/className';
import type { ChatConversationAwaitingState } from '../../../chatRealtime/types';
import {
  type ChatTimelineAwaitingForm,
  type ChatTimelineAwaitingInteractive,
  getAwaitingInteractiveTimeout,
} from '../../../chatTimeline/index.ts';
import { AwaitingFormViewport } from './AwaitingFormViewport';
import type { AwaitingFormViewportHandle } from './AwaitingFormViewportTypes';
import { AwaitingPanelFooter } from './AwaitingPanelFooter';
import {
  buildAwaitingSubmitPayload,
  mergeSubmittedParamsIntoAwaitingForms,
  type AwaitingFormDraft,
} from './awaitingSubmitState';

type AwaitingFormInteraction = Extract<ChatTimelineAwaitingInteractive, { kind: 'form' }>;

type AwaitingFormPanelProps = {
  awaiting: ChatConversationAwaitingState & { interactive: AwaitingFormInteraction };
  disabled: boolean;
  submitting: boolean;
  submitPayload: (payload: AwaitingSubmitPayloadData) => void;
};
const HEADER_CLASS = 'min-h-8 flex-row items-start justify-between gap-app-md';
const QUESTION_TEXT_CLASS = 'min-w-0 flex-1 gap-1';
const HEADING_CLASS = 'text-[15px] font-extrabold leading-[21px] text-app-primary';
const PROMPT_CLASS = 'text-[12px] leading-[17px] text-app-secondary';
const FORM_SWITCHER_CLASS = 'h-[28px] shrink-0 flex-row items-center gap-1';
const FORM_SWITCH_BUTTON_CLASS =
  'h-[28px] w-[28px] items-center justify-center rounded-app-sm bg-app-surface-muted active:opacity-[0.72]';
const FORM_SWITCH_ARROW_CLASS = 'text-[24px] font-extrabold leading-[26px] text-app-primary';
const FORM_SWITCH_TEXT_CLASS = 'min-w-9 text-center text-[12px] font-extrabold leading-4 text-app-secondary';
const PANEL_SCROLL_CLASS = 'max-h-[240px]';
const CARD_LIST_CLASS = 'gap-app-sm';
const AWAITING_CARD_CLASS = 'relative gap-app-sm rounded-app-md border border-app-line bg-app-background p-app-md';
const ITEM_TITLE_CLASS = 'pr-[22px] text-[14px] font-extrabold leading-[19px] text-app-primary';
const MONO_PAYLOAD_CLASS =
  'rounded-app-sm bg-app-surface-muted px-2 py-[7px] text-[12px] leading-[17px] text-app-secondary';
const DISABLED_BUTTON_CLASS = 'opacity-[0.38]';

function formatFormValue(form: ChatTimelineAwaitingForm): string {
  if (form.form === null || form.form === undefined) {
    return '';
  }
  try {
    return JSON.stringify(form.form, null, 2);
  } catch {
    return String(form.form);
  }
}

function getFormsSignature(forms: readonly ChatTimelineAwaitingForm[]): string {
  return forms
    .map((form) => [form.id, form.action ?? '', form.title ?? '', formatFormValue(form)].join('\u001f'))
    .join('\u001e');
}

function clampFormIndex(index: number, formsLength: number): number {
  if (formsLength <= 1) {
    return 0;
  }
  return Math.min(formsLength - 1, Math.max(0, index));
}

const FormFallbackItem = memo(function FormFallbackItem({ form }: { form: ChatTimelineAwaitingForm }) {
  const formatted = useMemo(() => formatFormValue(form), [form]);

  return (
    <View className={AWAITING_CARD_CLASS}>
      <Text allowFontScaling={false} className={ITEM_TITLE_CLASS}>
        {form.title || form.action || form.id}
      </Text>
      {formatted ? (
        <Text allowFontScaling={false} selectable className={MONO_PAYLOAD_CLASS}>
          {formatted}
        </Text>
      ) : null}
    </View>
  );
});

export function AwaitingFormPanel({ awaiting, disabled, submitting, submitPayload }: AwaitingFormPanelProps) {
  const t = useT();
  const sourceForms = awaiting.interactive.forms;
  const sourceFormsRef = useRef(sourceForms);
  const sourceFormsSignature = useMemo(() => getFormsSignature(sourceForms), [sourceForms]);
  const [forms, setForms] = useState<readonly ChatTimelineAwaitingForm[]>(sourceForms);
  const [activeFormIndex, setActiveFormIndex] = useState(0);
  const [errorText, setErrorText] = useState('');
  const [collecting, setCollecting] = useState(false);
  const viewportRef = useRef<AwaitingFormViewportHandle | null>(null);
  const viewportKey = awaiting.interactive.viewportKey.trim();
  const hasHtmlViewport = viewportKey.length > 0;
  const resolvedActiveFormIndex = clampFormIndex(activeFormIndex, forms.length);
  const activeForm = forms[resolvedActiveFormIndex];
  const timeoutMs = getAwaitingInteractiveTimeout(awaiting.interactive);

  useEffect(() => {
    sourceFormsRef.current = sourceForms;
  }, [sourceForms]);

  useEffect(() => {
    setForms(sourceFormsRef.current);
    setActiveFormIndex(0);
    setErrorText('');
    setCollecting(false);
  }, [awaiting.id, sourceFormsSignature]);

  useEffect(() => {
    setActiveFormIndex((current) => clampFormIndex(current, forms.length));
  }, [forms.length]);

  const buildSubmitAwaiting = useCallback(
    (submitForms: readonly ChatTimelineAwaitingForm[]) => ({
      ...awaiting,
      interactive: {
        ...awaiting.interactive,
        forms: [...submitForms],
      },
    }),
    [awaiting]
  );

  const applyCollectedParams = useCallback(
    (params: AwaitingSubmitParamData[]) => {
      const nextForms = mergeSubmittedParamsIntoAwaitingForms(forms, params);
      if (nextForms !== forms) {
        setForms(nextForms);
      }
      return nextForms;
    },
    [forms]
  );

  const submitDraft = useCallback(
    (draft: AwaitingFormDraft, submitForms = forms) => {
      try {
        submitPayload(buildAwaitingSubmitPayload(buildSubmitAwaiting(submitForms), { kind: 'form', ...draft }));
      } catch (error) {
        setErrorText(error instanceof Error ? error.message : String(error));
      }
    },
    [buildSubmitAwaiting, forms, submitPayload]
  );

  const submitRawParams = useCallback(
    (params: AwaitingSubmitParamData[]) => {
      const nextForms = applyCollectedParams(params);
      submitDraft({ decision: 'approve', rawParams: params }, nextForms);
    },
    [applyCollectedParams, submitDraft]
  );

  const collectViewportParams = useCallback(async (decision: 'submit' | 'reject' = 'submit') => {
    const viewport = viewportRef.current;
    if (!viewport) {
      throw new Error(t('awaiting.error.viewportNotReady'));
    }
    return viewport.collect(decision);
  }, [t]);

  const approve = useCallback(async () => {
    if (hasHtmlViewport) {
      try {
        setCollecting(true);
        setErrorText('');
        const params = await collectViewportParams();
        const nextForms = applyCollectedParams(params);
        submitDraft({ decision: 'approve', rawParams: params }, nextForms);
      } catch (error) {
        setErrorText(error instanceof Error ? error.message : String(error));
      } finally {
        setCollecting(false);
      }
      return;
    }
    submitDraft({ decision: 'approve' });
  }, [applyCollectedParams, collectViewportParams, hasHtmlViewport, submitDraft]);

  const reject = useCallback(async () => {
    if (hasHtmlViewport) {
      try {
        setCollecting(true);
        setErrorText('');
        const params = await collectViewportParams('reject');
        const nextForms = applyCollectedParams(params);
        submitDraft({ decision: 'reject' }, nextForms);
      } catch (error) {
        setErrorText(error instanceof Error ? error.message : String(error));
      } finally {
        setCollecting(false);
      }
      return;
    }
    submitDraft({ decision: 'reject' });
  }, [applyCollectedParams, collectViewportParams, hasHtmlViewport, submitDraft]);

  const switchForm = useCallback(
    async (nextIndex: number) => {
      const resolvedIndex = clampFormIndex(nextIndex, forms.length);
      if (resolvedIndex === resolvedActiveFormIndex) {
        return;
      }

      try {
        setCollecting(true);
        setErrorText('');
        const params = await collectViewportParams();
        const nextForms = applyCollectedParams(params);
        setActiveFormIndex(clampFormIndex(resolvedIndex, nextForms.length));
      } catch (error) {
        setErrorText(error instanceof Error ? error.message : String(error));
      } finally {
        setCollecting(false);
      }
    },
    [applyCollectedParams, collectViewportParams, forms.length, resolvedActiveFormIndex]
  );

  const switchDisabled = disabled || collecting || submitting || forms.length <= 1;

  return (
    <>
      <View className={HEADER_CLASS}>
        <View className={QUESTION_TEXT_CLASS}>
          <Text allowFontScaling={false} className={HEADING_CLASS}>
            {activeForm?.title || activeForm?.action || awaiting.prompt || t('awaiting.form.title')}
          </Text>
          {awaiting.payloadText ? (
            <Text allowFontScaling={false} numberOfLines={2} className={PROMPT_CLASS}>
              {awaiting.payloadText}
            </Text>
          ) : null}
        </View>
        {hasHtmlViewport && forms.length > 1 ? (
          <View className={FORM_SWITCHER_CLASS}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: switchDisabled || resolvedActiveFormIndex <= 0 }}
              disabled={switchDisabled || resolvedActiveFormIndex <= 0}
              onPress={() => void switchForm(resolvedActiveFormIndex - 1)}
              className={cn(
                FORM_SWITCH_BUTTON_CLASS,
                switchDisabled || resolvedActiveFormIndex <= 0 ? DISABLED_BUTTON_CLASS : null
              )}
            >
              <Text allowFontScaling={false} className={FORM_SWITCH_ARROW_CLASS}>
                ‹
              </Text>
            </Pressable>
            <Text allowFontScaling={false} numberOfLines={1} className={FORM_SWITCH_TEXT_CLASS}>
              {resolvedActiveFormIndex + 1}/{forms.length}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: switchDisabled || resolvedActiveFormIndex >= forms.length - 1 }}
              disabled={switchDisabled || resolvedActiveFormIndex >= forms.length - 1}
              onPress={() => void switchForm(resolvedActiveFormIndex + 1)}
              className={cn(
                FORM_SWITCH_BUTTON_CLASS,
                switchDisabled || resolvedActiveFormIndex >= forms.length - 1 ? DISABLED_BUTTON_CLASS : null
              )}
            >
              <Text allowFontScaling={false} className={FORM_SWITCH_ARROW_CLASS}>
                ›
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
      {hasHtmlViewport ? (
        <AwaitingFormViewport
          ref={viewportRef}
          awaiting={awaiting}
          activeFormIndex={resolvedActiveFormIndex}
          disabled={disabled || collecting}
          viewportKey={viewportKey}
          timeoutMs={timeoutMs}
          forms={forms}
          onSubmitParams={submitRawParams}
          onError={setErrorText}
        />
      ) : (
        <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} className={PANEL_SCROLL_CLASS}>
          <View className={CARD_LIST_CLASS}>
            {forms.map((form) => (
              <FormFallbackItem key={form.id} form={form} />
            ))}
          </View>
        </ScrollView>
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
        onSecondary={reject}
      />
    </>
  );
}
