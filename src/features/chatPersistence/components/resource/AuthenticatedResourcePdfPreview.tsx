import { memo } from 'react';
import { Text, View } from 'react-native';

import type { ApiUriSource } from '../../../../core/api/apiClient.ts';

export type AuthenticatedResourcePdfPreviewProps = {
  source: ApiUriSource;
  unavailableLabel: string;
  onError: (message: string) => void;
};

export const AuthenticatedResourcePdfPreview = memo(function AuthenticatedResourcePdfPreview({
  unavailableLabel
}: AuthenticatedResourcePdfPreviewProps) {
  return (
    <View className="flex-1 items-center justify-center px-app-lg">
      <Text allowFontScaling={false} className="text-center text-app-body text-app-secondary">
        {unavailableLabel}
      </Text>
    </View>
  );
});
