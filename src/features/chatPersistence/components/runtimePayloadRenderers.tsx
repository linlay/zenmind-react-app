import { memo, type ComponentType } from 'react';
import { Text, View } from 'react-native';

import { ChatConversationMarkdownRenderer } from '../markdownLinks/ChatConversationMarkdownRenderer.tsx';
import { useT } from '../../../shared/i18n';
import { useAppTheme } from '../../../shared/visual/AppThemeProvider';
import { cn } from '../../../shared/visual/className';
import { formatChatDetailRunningDuration } from '../chatDetailFormatters';
import { useRunningElapsedMs } from './useRunningElapsedMs.ts';
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

const STACK_CLASS = 'gap-[9px]';
const SECTION_CLASS = 'gap-[5px]';
const TOOL_SECTION_CLASS = 'gap-[5px]';
const TOOL_RECORD_CARD_CLASS = 'gap-[7px] rounded-app-sm bg-app-surface px-[10px] py-[9px]';
const TOOL_RECORD_HEADER_CLASS = 'min-h-[18px] flex-row items-center gap-app-sm';
const TOOL_RECORD_TITLE_CLASS = 'font-mono text-[11px] font-bold leading-4 text-app-secondary';
const TOOL_RECORD_META_CLASS = 'min-w-0 flex-1 flex-row items-center justify-end gap-app-sm';
const TOOL_RECORD_STATUS_CLASS = 'font-mono text-[11px] font-bold leading-4';
const TOOL_RECORD_DURATION_CLASS = 'shrink-0 font-mono text-[11px] font-bold leading-4 tabular-nums text-app-tertiary';
const TOOL_DESCRIPTION_CLASS = 'text-[12px] leading-[18px] text-app-secondary';
const TOOL_ARGUMENT_ROWS_CLASS = 'gap-[3px]';
const TOOL_ARGUMENT_ROW_CLASS = 'min-w-0 gap-[2px]';
const TOOL_ARGUMENT_KEY_CLASS = 'font-mono text-[12px] leading-[18px] text-app-success';
const TOOL_ARGUMENT_VALUE_CLASS = 'ml-app-lg min-w-0 font-mono text-[12px] leading-[18px] text-app-primary';
const TOOL_INLINE_TEXT_CLASS = 'font-mono text-[12px] leading-[18px] text-app-primary';
const TOOL_RESULT_TEXT_CLASS = 'font-mono text-[12px] leading-[18px] text-app-secondary';
const SECTION_LABEL_CLASS = 'text-[11px] font-bold leading-[15px] text-app-success';
const SECTION_TEXT_CLASS = 'text-[13px] leading-5 text-app-primary';
const CODE_TEXT_CLASS = 'rounded-app-sm bg-app-surface p-[10px] font-mono text-[12px] leading-[18px] text-app-primary';
const TOOL_TEXT_CLASS = 'rounded-app-sm bg-app-surface p-[10px] font-mono text-[12px] leading-[18px] text-app-primary';
const NOWRAP_TEXT_CLASS = 'min-w-[680px]';
const NOWRAP_TOOL_VALUE_CLASS = 'min-w-[560px]';
const NOWRAP_MARKDOWN_CLASS = 'min-w-[680px]';
const METRIC_BOX_CLASS = 'rounded-app-sm bg-app-surface px-[10px] py-[9px]';
const METRIC_TEXT_CLASS = 'text-[13px] font-bold leading-[19px] text-app-primary';

function useRunningToolDurationText(startedAt: number | null | undefined): string {
  const t = useT();
  const elapsedMs = useRunningElapsedMs(startedAt);
  const startTime = Number(startedAt);
  const duration =
    elapsedMs === null || !Number.isFinite(startTime)
      ? ''
      : formatChatDetailRunningDuration(startTime, startTime + elapsedMs);
  return duration ? t('runtime.duration', { duration }) : '';
}

function SectionLabel({ text }: { text: string }) {
  if (!text) {
    return null;
  }
  return (
    <Text allowFontScaling={false} className={SECTION_LABEL_CLASS}>
      {text}
    </Text>
  );
}

function TextSection({ section, wrap }: { section: RuntimePayloadSection; wrap: boolean }) {
  if (!section.text) {
    return null;
  }

  return (
    <View className={SECTION_CLASS}>
      <SectionLabel text={section.label} />
      {section.mode === 'markdown' ? (
        <View className={!wrap ? NOWRAP_MARKDOWN_CLASS : undefined}>
          <ChatConversationMarkdownRenderer markdown={section.text} />
        </View>
      ) : (
        <Text
          allowFontScaling={false}
          selectable
          className={cn(section.mode === 'code' ? CODE_TEXT_CLASS : SECTION_TEXT_CLASS, !wrap ? NOWRAP_TEXT_CLASS : null)}
        >
          {section.text}
        </Text>
      )}
    </View>
  );
}

function SectionStackPayload({ descriptor, wrap }: RuntimePayloadContentProps) {
  return (
    <View className={STACK_CLASS}>
      {descriptor.sections.map((section) => (
        <TextSection key={section.id} section={section} wrap={wrap} />
      ))}
    </View>
  );
}

const MarkdownPayload = memo(SectionStackPayload);

function ToolArgumentRows({ record, wrap }: { record: RuntimeToolRecord; wrap: boolean }) {
  if (record.argsRows.length > 0) {
    return (
      <View className={TOOL_ARGUMENT_ROWS_CLASS}>
        {record.argsRows.map((row) => (
          <View key={row.key} className={TOOL_ARGUMENT_ROW_CLASS}>
            <Text allowFontScaling={false} className={TOOL_ARGUMENT_KEY_CLASS}>
              {row.key}
            </Text>
            <Text
              allowFontScaling={false}
              selectable
              className={cn(TOOL_ARGUMENT_VALUE_CLASS, !wrap ? NOWRAP_TOOL_VALUE_CLASS : null)}
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
      className={cn(TOOL_INLINE_TEXT_CLASS, !wrap ? NOWRAP_TEXT_CLASS : null)}
    >
      {record.argsInlineText}
    </Text>
  );
}

const RunningToolDurationText = memo(function RunningToolDurationText({
  startedAt,
}: {
  startedAt: number;
}) {
  const durationText = useRunningToolDurationText(startedAt);
  if (!durationText) {
    return null;
  }

  return (
    <Text allowFontScaling={false} numberOfLines={1} className={TOOL_RECORD_DURATION_CLASS}>
      {durationText}
    </Text>
  );
});

function ToolRecordDuration({ record }: { record: RuntimeToolRecord }) {
  if (record.durationText) {
    return (
      <Text allowFontScaling={false} numberOfLines={1} className={TOOL_RECORD_DURATION_CLASS}>
        {record.durationText}
      </Text>
    );
  }
  if (record.startedAt) {
    return <RunningToolDurationText startedAt={record.startedAt} />;
  }
  return null;
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
  const showHeader = grouped || Boolean(record.durationText) || Boolean(record.startedAt);

  return (
    <View className={TOOL_RECORD_CARD_CLASS}>
      {showHeader ? (
        <View className={TOOL_RECORD_HEADER_CLASS}>
          <Text allowFontScaling={false} className={TOOL_RECORD_TITLE_CLASS}>
            {record.title}
          </Text>
          <View className={TOOL_RECORD_META_CLASS}>
            <Text
              allowFontScaling={false}
              numberOfLines={1}
              className={TOOL_RECORD_STATUS_CLASS}
              style={{ color: getRuntimeToolStatusColor(theme.colors, record.status) }}
            >
              {record.statusLabel}
            </Text>
            <ToolRecordDuration record={record} />
          </View>
        </View>
      ) : null}
      {record.description ? (
        <Text allowFontScaling={false} className={TOOL_DESCRIPTION_CLASS}>
          {record.description}
        </Text>
      ) : null}
      <ToolArgumentRows record={record} wrap={wrap} />
      {record.resultText ? (
        <Text
          allowFontScaling={false}
          selectable
          className={cn(TOOL_RESULT_TEXT_CLASS, !wrap ? NOWRAP_TEXT_CLASS : null)}
        >
          {record.resultText}
        </Text>
      ) : null}
    </View>
  );
}

const ToolPayload = memo(function ToolPayload({ descriptor, wrap }: RuntimePayloadContentProps) {
  const records = descriptor.toolRecords.filter((record) => record.hasDetails);
  if (records.length > 0) {
    const grouped = descriptor.toolRecords.length > 1;
    return (
      <View className={STACK_CLASS}>
        {records.map((record) => (
          <ToolRecordCard key={record.key} grouped={grouped} record={record} wrap={wrap} />
        ))}
      </View>
    );
  }

  return (
    <View className={STACK_CLASS}>
      {descriptor.sections.map((section) => (
        <View key={section.id} className={TOOL_SECTION_CLASS}>
          <SectionLabel text={section.label} />
          <Text
            allowFontScaling={false}
            selectable
            className={cn(TOOL_TEXT_CLASS, !wrap ? NOWRAP_TEXT_CLASS : null)}
          >
            {section.text}
          </Text>
        </View>
      ))}
    </View>
  );
});

const AwaitingPayload = memo(SectionStackPayload);

const PlainPayload = memo(SectionStackPayload);

const MetricPayload = memo(function MetricPayload({
  descriptor,
  wrap,
}: RuntimePayloadContentProps) {
  return (
    <View className={METRIC_BOX_CLASS}>
      {descriptor.sections.map((section) => (
        <Text
          key={section.id}
          allowFontScaling={false}
          selectable
          className={cn(METRIC_TEXT_CLASS, !wrap ? NOWRAP_TEXT_CLASS : null)}
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
  plain: PlainPayload,
  metric: MetricPayload,
} satisfies Record<RuntimePayloadRendererType, ComponentType<RuntimePayloadContentProps>>;
