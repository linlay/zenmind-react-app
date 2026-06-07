import { appVisualTokens } from '../../../shared/visual/foundation';
import type { RuntimeToolStatus } from './runtimePayloadDescriptor';

export function getRuntimeToolStatusColor(status: RuntimeToolStatus): string {
  if (status === 'success') {
    return appVisualTokens.colors.success;
  }
  if (status === 'error' || status === 'failed' || status === 'canceled') {
    return appVisualTokens.colors.danger;
  }
  if (status === 'running' || status === 'completed') {
    return appVisualTokens.colors.brandBlue;
  }
  return appVisualTokens.colors.textTertiary;
}
