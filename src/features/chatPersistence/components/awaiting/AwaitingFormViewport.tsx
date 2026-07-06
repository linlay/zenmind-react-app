import { forwardRef, memo, useImperativeHandle } from 'react';
import { Text, View } from 'react-native';

import type { AwaitingSubmitParamData } from '../../../../core/api/services/chatApi';
import { useT } from '../../../../shared/i18n';
import type {
  AwaitingFormCollectDecision,
  AwaitingFormViewportHandle,
  AwaitingFormViewportProps,
} from './AwaitingFormViewportTypes';

const EMPTY_BOX_CLASS =
  'min-h-24 items-center justify-center rounded-app-md border border-app-line bg-app-surface-muted p-app-md';
const EMPTY_TEXT_CLASS = 'text-center text-[13px] leading-[18px] text-app-secondary';

const AwaitingFormViewportInner = forwardRef<AwaitingFormViewportHandle, AwaitingFormViewportProps>(
  function AwaitingFormViewportInner({ forms, onError }, ref) {
    const t = useT();

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
      <View className={EMPTY_BOX_CLASS}>
        <Text allowFontScaling={false} className={EMPTY_TEXT_CLASS}>
          {t('awaiting.form.viewportUnavailable')}
        </Text>
      </View>
    );
  }
);

export const AwaitingFormViewport = memo(AwaitingFormViewportInner);
