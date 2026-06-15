import { memo, type ComponentType } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ConversationMarkdownRenderer } from '../../../shared/components/ConversationMarkdownRenderer';
import { useAppTheme, useAppThemeStyles } from '../../../shared/visual/AppThemeProvider';
import { appVisualTokens, type AppThemeTokens } from '../../../shared/visual/foundation';
import type {
  RuntimePayloadDescriptor,
  RuntimePayloadRendererType,
  RuntimePayloadSection,
  RuntimeToolRecord,
} from './runtimePayloadDescriptor';
import { getRuntimeToolStatusColor } from './runtimeToolStatusVisual';

type RuntimePayloadContentProps = {
  descriptor: RuntimePayloadDescriptor;
  wrap: boolean;
};

function SectionLabel({ text }: { text: string }) {
  const styles = useAppThemeStyles(createStyles);

  if (!text) {
    return null;
  }
  return (
    <Text allowFontScaling={false} style={styles.sectionLabel}>
      {text}
    </Text>
  );
}

function TextSection({ section, wrap }: { section: RuntimePayloadSection; wrap: boolean }) {
  const styles = useAppThemeStyles(createStyles);

  if (!section.text) {
    return null;
  }

  return (
    <View style={styles.section}>
      <SectionLabel text={section.label} />
      {section.mode === 'markdown' ? (
        <View style={!wrap && styles.nowrapMarkdown}>
          <ConversationMarkdownRenderer markdown={section.text} />
        </View>
      ) : (
        <Text
          allowFontScaling={false}
          selectable
          style={[
            styles.sectionText,
            section.mode === 'code' && styles.codeText,
            !wrap && styles.nowrapText,
          ]}
        >
          {section.text}
        </Text>
      )}
    </View>
  );
}

function SectionStackPayload({ descriptor, wrap }: RuntimePayloadContentProps) {
  const styles = useAppThemeStyles(createStyles);

  return (
    <View style={styles.stack}>
      {descriptor.sections.map((section) => (
        <TextSection key={section.id} section={section} wrap={wrap} />
      ))}
    </View>
  );
}

const MarkdownPayload = memo(SectionStackPayload);

function ToolArgumentRows({ record, wrap }: { record: RuntimeToolRecord; wrap: boolean }) {
  const styles = useAppThemeStyles(createStyles);

  if (record.argsRows.length > 0) {
    return (
      <View style={styles.toolArgumentRows}>
        {record.argsRows.map((row) => (
          <View key={row.key} style={styles.toolArgumentRow}>
            <Text allowFontScaling={false} style={styles.toolArgumentKey}>
              {row.key}
            </Text>
            <Text
              allowFontScaling={false}
              selectable
              style={[styles.toolArgumentValue, !wrap && styles.nowrapToolValue]}
            >
              {row.valueText}
            </Text>
          </View>
        ))}
      </View>
    );
  }

  if (!record.argsInlineText) {
    return null;
  }

  return (
    <Text
      allowFontScaling={false}
      selectable
      style={[styles.toolInlineText, !wrap && styles.nowrapText]}
    >
      {record.argsInlineText}
    </Text>
  );
}

function ToolRecordCard({
  grouped,
  record,
  wrap,
}: {
  grouped: boolean;
  record: RuntimeToolRecord;
  wrap: boolean;
}) {
  const { theme } = useAppTheme();
  const styles = useAppThemeStyles(createStyles);

  return (
    <View style={styles.toolRecordCard}>
      {grouped ? (
        <View style={styles.toolRecordHeader}>
          <Text allowFontScaling={false} style={styles.toolRecordTitle}>
            {record.title}
          </Text>
          <Text
            allowFontScaling={false}
            style={[styles.toolRecordStatus, { color: getRuntimeToolStatusColor(theme.colors, record.status) }]}
          >
            {record.statusLabel}
          </Text>
        </View>
      ) : null}
      {record.description ? (
        <Text allowFontScaling={false} style={styles.toolDescription}>
          {record.description}
        </Text>
      ) : null}
      <ToolArgumentRows record={record} wrap={wrap} />
      {record.resultText ? (
        <Text
          allowFontScaling={false}
          selectable
          style={[styles.toolResultText, !wrap && styles.nowrapText]}
        >
          {record.resultText}
        </Text>
      ) : null}
    </View>
  );
}

const ToolPayload = memo(function ToolPayload({ descriptor, wrap }: RuntimePayloadContentProps) {
  const styles = useAppThemeStyles(createStyles);
  const records = descriptor.toolRecords.filter((record) => record.hasDetails);
  if (records.length > 0) {
    const grouped = descriptor.toolRecords.length > 1;
    return (
      <View style={styles.stack}>
        {records.map((record) => (
          <ToolRecordCard key={record.key} grouped={grouped} record={record} wrap={wrap} />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      {descriptor.sections.map((section) => (
        <View key={section.id} style={styles.toolSection}>
          <SectionLabel text={section.label} />
          <Text
            allowFontScaling={false}
            selectable
            style={[styles.toolText, !wrap && styles.nowrapText]}
          >
            {section.text}
          </Text>
        </View>
      ))}
    </View>
  );
});

const AwaitingPayload = memo(SectionStackPayload);

const RecordPayload = memo(SectionStackPayload);

const PlainPayload = memo(SectionStackPayload);

const MetricPayload = memo(function MetricPayload({
  descriptor,
  wrap,
}: RuntimePayloadContentProps) {
  const styles = useAppThemeStyles(createStyles);

  return (
    <View style={styles.metricBox}>
      {descriptor.sections.map((section) => (
        <Text
          key={section.id}
          allowFontScaling={false}
          selectable
          style={[styles.metricText, !wrap && styles.nowrapText]}
        >
          {section.text}
        </Text>
      ))}
    </View>
  );
});

export const RuntimePayloadContent = memo(function RuntimePayloadContent({
  descriptor,
  wrap,
}: RuntimePayloadContentProps) {
  const Renderer = PAYLOAD_RENDERERS[descriptor.renderer];
  return <Renderer descriptor={descriptor} wrap={wrap} />;
});

const PAYLOAD_RENDERERS = {
  markdown: MarkdownPayload,
  tool: ToolPayload,
  awaiting: AwaitingPayload,
  record: RecordPayload,
  plain: PlainPayload,
  metric: MetricPayload,
} satisfies Record<RuntimePayloadRendererType, ComponentType<RuntimePayloadContentProps>>;

function createStyles(theme: AppThemeTokens) {
  return StyleSheet.create({
    stack: {
      gap: 9,
    },
    section: {
      gap: 5,
    },
    toolSection: {
      gap: 5,
    },
    toolRecordCard: {
      gap: 7,
      borderRadius: appVisualTokens.radii.sm,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 9,
    },
    toolRecordHeader: {
      minHeight: 18,
      flexDirection: 'row',
      alignItems: 'center',
      gap: appVisualTokens.spacing.sm,
    },
    toolRecordTitle: {
      fontFamily: 'monospace',
      fontSize: 11,
      lineHeight: 16,
      fontWeight: '700',
      color: theme.colors.textSecondary,
    },
    toolRecordStatus: {
      fontFamily: 'monospace',
      fontSize: 11,
      lineHeight: 16,
      fontWeight: '700',
    },
    toolDescription: {
      fontSize: 12,
      lineHeight: 18,
      color: theme.colors.textSecondary,
    },
    toolArgumentRows: {
      gap: 3,
    },
    toolArgumentRow: {
      minWidth: 0,
      gap: 2,
    },
    toolArgumentKey: {
      fontFamily: 'monospace',
      fontSize: 12,
      lineHeight: 18,
      color: theme.colors.success,
    },
    toolArgumentValue: {
      minWidth: 0,
      marginLeft: appVisualTokens.spacing.lg,
      fontFamily: 'monospace',
      fontSize: 12,
      lineHeight: 18,
      color: theme.colors.textPrimary,
    },
    toolInlineText: {
      fontFamily: 'monospace',
      fontSize: 12,
      lineHeight: 18,
      color: theme.colors.textPrimary,
    },
    toolResultText: {
      fontFamily: 'monospace',
      fontSize: 12,
      lineHeight: 18,
      color: theme.colors.textSecondary,
    },
    sectionLabel: {
      fontSize: 11,
      lineHeight: 15,
      fontWeight: '700',
      color: theme.colors.success,
    },
    sectionText: {
      fontSize: 13,
      lineHeight: 20,
      color: theme.colors.textPrimary,
    },
    codeText: {
      padding: 10,
      borderRadius: appVisualTokens.radii.sm,
      backgroundColor: theme.colors.surface,
      fontFamily: 'monospace',
      fontSize: 12,
      lineHeight: 18,
      color: theme.colors.textPrimary,
    },
    toolText: {
      padding: 10,
      borderRadius: appVisualTokens.radii.sm,
      backgroundColor: theme.colors.surface,
      fontFamily: 'monospace',
      fontSize: 12,
      lineHeight: 18,
      color: theme.colors.textPrimary,
    },
    nowrapText: {
      minWidth: 680,
    },
    nowrapToolValue: {
      minWidth: 560,
    },
    nowrapMarkdown: {
      minWidth: 680,
    },
    metricBox: {
      borderRadius: appVisualTokens.radii.sm,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 9,
    },
    metricText: {
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
  });
}
