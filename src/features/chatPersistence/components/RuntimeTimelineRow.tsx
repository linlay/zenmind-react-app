import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '../../../shared/icons/AppIcon';
import { appVisualTokens } from '../../../shared/visual/foundation';
import type { ChatTimelineDisplayItem } from '../../chatTimeline/index.ts';
import { ChatTimelineRail } from './ChatTimelineRail';
import { RuntimePayloadFrame } from './RuntimePayloadFrame';
import {
  buildRuntimePayloadDescriptor,
  type RuntimePayloadDescriptor,
} from './runtimePayloadDescriptor';
import { RuntimePayloadContent } from './runtimePayloadRenderers';
import { getRuntimeToolStatusColor } from './runtimeToolStatusVisual';

type RuntimeTimelineRowProps = {
  item: ChatTimelineDisplayItem;
  onCopyText: (text: string) => void;
  getInitialExpanded: (nodeId: string, fallback: boolean) => boolean;
  onExpandedChange: (nodeId: string, expanded: boolean) => void;
};

const TONE_COLORS: Record<RuntimePayloadDescriptor['tone'], string> = {
  reasoning: appVisualTokens.colors.warning,
  tool: appVisualTokens.colors.brandBlue,
  file: appVisualTokens.colors.success,
  neutral: appVisualTokens.colors.textSecondary,
};

export const RuntimeTimelineRow = memo(function RuntimeTimelineRow({
  item,
  onCopyText,
  getInitialExpanded,
  onExpandedChange,
}: RuntimeTimelineRowProps) {
  const descriptor = useMemo(
    () => buildRuntimePayloadDescriptor(item.kind === 'tool-group' ? item : item.node),
    [item]
  );
  const [expanded, setExpanded] = useState(() =>
    getInitialExpanded(descriptor.id, descriptor.defaultExpanded)
  );

  useEffect(() => {
    setExpanded(getInitialExpanded(descriptor.id, descriptor.defaultExpanded));
  }, [descriptor.defaultExpanded, descriptor.id, getInitialExpanded]);

  const handleToggle = useCallback(() => {
    if (!descriptor.canExpand) {
      return;
    }

    setExpanded((value) => {
      const nextValue = !value;
      onExpandedChange(descriptor.id, nextValue);
      return nextValue;
    });
  }, [descriptor.canExpand, descriptor.id, onExpandedChange]);

  const renderPayloadContent = useCallback(
    (wrap: boolean) => <RuntimePayloadContent descriptor={descriptor} wrap={wrap} />,
    [descriptor]
  );
  const showToolStatusDots = descriptor.toolRecords.length > 0;
  const headerContent = (
    <>
      <View style={styles.runtimeHeaderLeading}>
        <Text allowFontScaling={false} numberOfLines={1} style={styles.runtimeTitle}>
          {descriptor.title}
        </Text>
        {showToolStatusDots ? (
          <View style={styles.toolStatusDots}>
            {descriptor.toolRecords.map((record) => (
              <View
                key={record.key}
                accessibilityLabel={`${record.title}${record.statusLabel}`}
                style={[
                  styles.toolStatusDot,
                  { backgroundColor: getRuntimeToolStatusColor(record.status) },
                ]}
              />
            ))}
          </View>
        ) : null}
      </View>
      {descriptor.canExpand ? (
        <View style={styles.foldButton}>
          <AppIcon usage={expanded ? 'runtime.collapse' : 'runtime.expand'} />
        </View>
      ) : null}
    </>
  );

  return (
    <View style={styles.timelineRow}>
      <ChatTimelineRail
        iconUsage={descriptor.iconUsage}
        terminal={item.isLastInRun}
        toneColor={TONE_COLORS[descriptor.tone]}
      />
      <View style={styles.timelineBody}>
        <View style={styles.runtimeBlock}>
          {descriptor.canExpand ? (
            <Pressable
              accessibilityLabel={expanded ? '收起内容' : '展开内容'}
              accessibilityRole="button"
              onPress={handleToggle}
              style={({ pressed }) => [styles.runtimeHeader, pressed && styles.rowPressed]}
            >
              {headerContent}
            </Pressable>
          ) : (
            <View style={styles.runtimeHeader}>{headerContent}</View>
          )}

          {expanded && descriptor.canExpand ? (
            <RuntimePayloadFrame
              descriptorId={descriptor.id}
              copyText={descriptor.copyText}
              defaultWrap={descriptor.defaultWrap}
              onCopyText={onCopyText}
              renderContent={renderPayloadContent}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    marginBottom: 16,
  },
  timelineBody: {
    flex: 1,
    minWidth: 0,
  },
  runtimeBlock: {
    alignSelf: 'stretch',
  },
  runtimeHeader: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  runtimeHeaderLeading: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  runtimeTitle: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    color: appVisualTokens.colors.textPrimary,
  },
  toolStatusDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexShrink: 0,
  },
  toolStatusDot: {
    width: 7,
    height: 7,
    borderRadius: appVisualTokens.radii.pill,
  },
  foldButton: {
    width: 28,
    height: 28,
    borderRadius: appVisualTokens.radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowPressed: {
    opacity: 0.72,
  },
});
