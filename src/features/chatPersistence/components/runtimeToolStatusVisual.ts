import type { AppVisualColors } from '../../../shared/visual/foundation';
import type { RuntimeToolStatus } from './runtimePayloadDescriptor';

export function getRuntimeToolStatusColor(colors: AppVisualColors, status: RuntimeToolStatus): string {
  if (status === 'success') {
    return colors.success;
  }
  if (status === 'error' || status === 'failed' || status === 'canceled') {
    return colors.danger;
  }
  if (status === 'running' || status === 'completed') {
    return colors.brandBlue;
  }
  return colors.textTertiary;
}
