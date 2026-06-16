import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AwaitingSubmitParamData, AwaitingSubmitPayloadData } from '../../../../core/api/services/chatApi';
import { useT } from '../../../../shared/i18n';
import { useAppThemeStyles } from '../../../../shared/visual/AppThemeProvider';
import { appVisualTokens, type AppThemeTokens } from '../../../../shared/visual/foundation';
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
  const styles = useAppThemeStyles(createStyles);
  const formatted = useMemo(() => formatFormValue(form), [form]);

  return (
    <View style={styles.awaitingCard}>
      <Text allowFontScaling={false} style={styles.itemTitle}>
        {form.title || form.action || form.id}
      </Text>
      {formatted ? (
        <Text allowFontScaling={false} selectable style={styles.monoPayload}>
          {formatted}
        </Text>
      ) : null}
    </View>
  );
});

export function AwaitingFormPanel({ awaiting, disabled, submitting, submitPayload }: AwaitingFormPanelProps) {
  const t = useT();
  const styles = useAppThemeStyles(createStyles);
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
      <View style={styles.header}>
        <View style={styles.questionText}>
          <Text allowFontScaling={false} style={styles.heading}>
            {activeForm?.title || activeForm?.action || awaiting.prompt || t('awaiting.form.title')}
          </Text>
          {awaiting.payloadText ? (
            <Text allowFontScaling={false} numberOfLines={2} style={styles.prompt}>
              {awaiting.payloadText}
            </Text>
          ) : null}
        </View>
        {hasHtmlViewport && forms.length > 1 ? (
          <View style={styles.formSwitcher}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: switchDisabled || resolvedActiveFormIndex <= 0 }}
              disabled={switchDisabled || resolvedActiveFormIndex <= 0}
              onPress={() => void switchForm(resolvedActiveFormIndex - 1)}
              style={({ pressed }) => [
                styles.formSwitchButton,
                (switchDisabled || resolvedActiveFormIndex <= 0) && styles.disabledButton,
                pressed && styles.pressed,
              ]}
            >
              <Text allowFontScaling={false} style={styles.formSwitchArrow}>
                ‹
              </Text>
            </Pressable>
            <Text allowFontScaling={false} numberOfLines={1} style={styles.formSwitchText}>
              {resolvedActiveFormIndex + 1}/{forms.length}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: switchDisabled || resolvedActiveFormIndex >= forms.length - 1 }}
              disabled={switchDisabled || resolvedActiveFormIndex >= forms.length - 1}
              onPress={() => void switchForm(resolvedActiveFormIndex + 1)}
              style={({ pressed }) => [
                styles.formSwitchButton,
                (switchDisabled || resolvedActiveFormIndex >= forms.length - 1) && styles.disabledButton,
                pressed && styles.pressed,
              ]}
            >
              <Text allowFontScaling={false} style={styles.formSwitchArrow}>
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
        <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} style={styles.panelScroll}>
          <View style={styles.cardList}>
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

function createStyles(theme: AppThemeTokens) {
  return StyleSheet.create({
    header: {
      minHeight: 32,
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: appVisualTokens.spacing.md,
    },
    questionText: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    heading: {
      fontSize: 15,
      lineHeight: 21,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    prompt: {
      fontSize: 12,
      lineHeight: 17,
      color: theme.colors.textSecondary,
    },
    formSwitcher: {
      height: 28,
      flexShrink: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    formSwitchButton: {
      width: 28,
      height: 28,
      borderRadius: appVisualTokens.radii.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceMuted,
    },
    formSwitchArrow: {
      fontSize: 24,
      lineHeight: 26,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    formSwitchText: {
      minWidth: 36,
      textAlign: 'center',
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '800',
      color: theme.colors.textSecondary,
    },
    panelScroll: {
      maxHeight: 240,
    },
    cardList: {
      gap: appVisualTokens.spacing.sm,
    },
    awaitingCard: {
      position: 'relative',
      gap: appVisualTokens.spacing.sm,
      borderRadius: appVisualTokens.radii.md,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.background,
      padding: appVisualTokens.spacing.md,
    },
    itemTitle: {
      paddingRight: 22,
      fontSize: 14,
      lineHeight: 19,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    monoPayload: {
      borderRadius: appVisualTokens.radii.sm,
      backgroundColor: theme.colors.surfaceMuted,
      paddingHorizontal: 8,
      paddingVertical: 7,
      fontSize: 12,
      lineHeight: 17,
      color: theme.colors.textSecondary,
    },
    disabledButton: {
      opacity: 0.38,
    },
    pressed: {
      opacity: 0.72,
    },
  });
}
