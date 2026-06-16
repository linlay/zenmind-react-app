import { forwardRef, memo, useImperativeHandle } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { AwaitingSubmitParamData } from '../../../../core/api/services/chatApi';
import { useT } from '../../../../shared/i18n';
import { useAppThemeStyles } from '../../../../shared/visual/AppThemeProvider';
import { appVisualTokens, type AppThemeTokens } from '../../../../shared/visual/foundation';
import type {
  AwaitingFormCollectDecision,
  AwaitingFormViewportHandle,
  AwaitingFormViewportProps,
} from './AwaitingFormViewportTypes';

const AwaitingFormViewportInner = forwardRef<AwaitingFormViewportHandle, AwaitingFormViewportProps>(
  function AwaitingFormViewportInner({ forms, onError }, ref) {
    const t = useT();
    const styles = useAppThemeStyles(createStyles);

    useImperativeHandle(
      ref,
      () => ({
        collect(decision: AwaitingFormCollectDecision): Promise<AwaitingSubmitParamData[]> {
          if (decision === 'reject') {
            return Promise.resolve(forms.map((form) => ({ id: form.id, decision: 'reject' })));
          }
          const message = t('awaiting.form.viewportUnavailable');
          onError(message);
          return Promise.reject(new Error(message));
        },
      }),
      [forms, onError, t]
    );

    return (
      <View style={styles.emptyBox}>
        <Text allowFontScaling={false} style={styles.emptyText}>
          {t('awaiting.form.viewportUnavailable')}
        </Text>
      </View>
    );
  }
);

export const AwaitingFormViewport = memo(AwaitingFormViewportInner);

function createStyles(theme: AppThemeTokens) {
  return StyleSheet.create({
    emptyBox: {
      minHeight: 96,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: appVisualTokens.radii.md,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceMuted,
      padding: appVisualTokens.spacing.md,
    },
    emptyText: {
      textAlign: 'center',
      fontSize: 13,
      lineHeight: 18,
      color: theme.colors.textSecondary,
    },
  });
}
