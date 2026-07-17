export type ConversationPreviewKind = 'mermaid' | 'echarts' | 'html';

export type ConversationPreviewRenderer = 'inline' | 'overlay';

export type ConversationPreviewDefinition = {
  aliases: readonly string[];
  defaultSourceExpanded: boolean;
  renderer: ConversationPreviewRenderer;
  titleKey: `markdownPreview.${ConversationPreviewKind}`;
};

export const CONVERSATION_PREVIEW_REGISTRY = {
  mermaid: {
    aliases: ['mermaid', 'mmd', 'mermind'],
    defaultSourceExpanded: false,
    renderer: 'inline',
    titleKey: 'markdownPreview.mermaid'
  },
  echarts: {
    aliases: ['echart', 'echarts'],
    defaultSourceExpanded: false,
    renderer: 'inline',
    titleKey: 'markdownPreview.echarts'
  },
  html: {
    aliases: ['html'],
    defaultSourceExpanded: true,
    renderer: 'overlay',
    titleKey: 'markdownPreview.html'
  }
} as const satisfies Record<ConversationPreviewKind, ConversationPreviewDefinition>;

const PREVIEW_KIND_BY_ALIAS = new Map<string, ConversationPreviewKind>();

(Object.keys(CONVERSATION_PREVIEW_REGISTRY) as ConversationPreviewKind[]).forEach((kind) => {
  CONVERSATION_PREVIEW_REGISTRY[kind].aliases.forEach((alias) => PREVIEW_KIND_BY_ALIAS.set(alias, kind));
});

export const CONVERSATION_PREVIEW_MAX_ALIAS_LENGTH = Math.max(
  ...Array.from(PREVIEW_KIND_BY_ALIAS.keys(), (alias) => alias.length)
);

export function getConversationPreviewKind(info: string): ConversationPreviewKind | null {
  const language =
    info
      .trim()
      .split(/[\t ]+/, 1)[0]
      ?.toLowerCase() || '';
  return PREVIEW_KIND_BY_ALIAS.get(language) ?? null;
}
