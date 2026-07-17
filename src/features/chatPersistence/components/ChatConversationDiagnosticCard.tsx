import { memo, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { useT } from '../../../shared/i18n';
import { useAppTheme } from '../../../shared/visual/AppThemeProvider';
import type {
  ChatConversationDiagnosticSectionId,
  ChatConversationDiagnosticState
} from '../chatConversationDiagnostic';

type ChatConversationDiagnosticCardProps = {
  state: Exclude<ChatConversationDiagnosticState, { status: 'idle' }>;
};

const CARD_CLASS = 'rounded-app-lg border border-app-line bg-app-surface p-app-md';
const HEADER_CLASS = 'gap-1';
const TITLE_CLASS = 'text-[15px] font-bold leading-[21px] text-app-primary';
const DETAIL_CLASS = 'text-[12px] leading-[18px] text-app-secondary';
const STATUS_CLASS = 'mt-app-md flex-row items-center gap-app-sm';
const ERROR_CLASS = 'mt-app-md text-[13px] leading-5 text-app-danger';
const SECTIONS_CLASS = 'mt-app-md gap-app-sm';
const SECTION_CLASS = 'overflow-hidden rounded-app-md border border-app-line bg-app-surface-muted';
const SECTION_HEADER_CLASS = 'min-h-11 flex-row items-center px-app-md active:opacity-[0.72]';
const SECTION_TITLE_CLASS = 'min-w-0 flex-1 text-[13px] font-bold text-app-primary';
const SECTION_META_CLASS = 'text-[12px] font-semibold text-app-secondary';
const JSON_CONTAINER_CLASS = 'border-t border-app-line bg-app-surface';
const JSON_VERTICAL_SCROLL_CLASS = 'max-h-[420px]';
const JSON_CONTENT_CLASS = 'px-app-md py-app-sm';
const JSON_TEXT_CLASS = 'font-mono text-[11px] leading-[17px] text-app-primary';

const SECTION_IDS: ChatConversationDiagnosticSectionId[] = ['environment', 'remote', 'local', 'ui'];

export const ChatConversationDiagnosticCard = memo(function ChatConversationDiagnosticCard({
  state
}: ChatConversationDiagnosticCardProps) {
  const t = useT();
  const { theme } = useAppTheme();
  const [expandedSections, setExpandedSections] = useState<Set<ChatConversationDiagnosticSectionId>>(() => new Set());

  useEffect(() => {
    setExpandedSections(new Set());
  }, [state.requestId]);

  const handleToggleSection = useCallback((sectionId: ChatConversationDiagnosticSectionId) => {
    setExpandedSections((current) => {
      const next = new Set(current);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  return (
    <View className={CARD_CLASS}>
      <View className={HEADER_CLASS}>
        <Text allowFontScaling={false} className={TITLE_CLASS}>
          {t('chatDetail.diagnostic.title')}
        </Text>
        <Text allowFontScaling={false} className={DETAIL_CLASS}>
          {t('chatDetail.diagnostic.temporary')}
        </Text>
      </View>

      {state.status === 'loading' ? (
        <View className={STATUS_CLASS}>
          <ActivityIndicator size="small" color={theme.colors.brandBlue} />
          <Text allowFontScaling={false} className={DETAIL_CLASS}>
            {t('chatDetail.diagnostic.loading')}
          </Text>
        </View>
      ) : null}

      {state.status === 'error' ? (
        <Text allowFontScaling={false} selectable className={ERROR_CLASS}>
          {t('chatDetail.diagnostic.failed', { message: state.errorText })}
        </Text>
      ) : null}

      {state.status === 'ready' ? (
        <>
          <Text allowFontScaling={false} selectable className={DETAIL_CLASS}>
            {t('chatDetail.diagnostic.generatedAt', {
              time: new Date(state.report.generatedAt).toLocaleString()
            })}
          </Text>
          <View className={SECTIONS_CLASS}>
            {SECTION_IDS.map((sectionId) => {
              const section = state.report.sections.find((item) => item.id === sectionId);
              if (!section) {
                return null;
              }
              const expanded = expandedSections.has(sectionId);
              return (
                <View key={sectionId} className={SECTION_CLASS}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t(
                      expanded ? 'chatDetail.diagnostic.collapse' : 'chatDetail.diagnostic.expand',
                      { section: t(`chatDetail.diagnostic.section.${sectionId}`) }
                    )}
                    className={SECTION_HEADER_CLASS}
                    onPress={() => handleToggleSection(sectionId)}
                  >
                    <Text allowFontScaling={false} className={SECTION_TITLE_CLASS}>
                      {t(`chatDetail.diagnostic.section.${sectionId}`)}
                    </Text>
                    <Text allowFontScaling={false} className={SECTION_META_CLASS}>
                      {section.truncated ? `${t('chatDetail.diagnostic.truncated')} · ` : ''}
                      {expanded ? '−' : '+'}
                    </Text>
                  </Pressable>
                  {expanded ? (
                    <View className={JSON_CONTAINER_CLASS}>
                      <ScrollView nestedScrollEnabled className={JSON_VERTICAL_SCROLL_CLASS}>
                        <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator>
                          <View className={JSON_CONTENT_CLASS}>
                            <Text allowFontScaling={false} selectable className={JSON_TEXT_CLASS}>
                              {section.json}
                            </Text>
                          </View>
                        </ScrollView>
                      </ScrollView>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        </>
      ) : null}
    </View>
  );
});
