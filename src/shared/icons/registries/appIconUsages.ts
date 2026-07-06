import type { AppIconGlyphName } from './appIconRegistry';

export type AppIconColorRole =
  | 'brand'
  | 'brandStrong'
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'onBrandAction'
  | 'success'
  | 'warning';

export type AppIconSizeRole =
  | 'rail'
  | 'pinMarker'
  | 'toolbar'
  | 'fold'
  | 'sm'
  | 'md'
  | 'lg'
  | 'xl'
  | 'xxl'
  | 'tab';

export type AppIconUsageConfig = {
  glyph: AppIconGlyphName;
  colorRole: AppIconColorRole;
  sizeRole: AppIconSizeRole;
  strokeWidth?: number;
};

export const appIconUsages = {
  'tab.chat': { glyph: 'chat', colorRole: 'brand', sizeRole: 'tab' },
  'tab.terminal': { glyph: 'apps', colorRole: 'brand', sizeRole: 'tab' },
  'tab.drive': { glyph: 'drive', colorRole: 'brand', sizeRole: 'tab' },
  'tab.me': { glyph: 'user', colorRole: 'brand', sizeRole: 'tab' },

  'preview.terminalWorkbench': { glyph: 'apps', colorRole: 'brand', sizeRole: 'md' },
  'preview.terminalAction': { glyph: 'spark', colorRole: 'brand', sizeRole: 'md' },
  'preview.driveFiles': { glyph: 'drive', colorRole: 'brand', sizeRole: 'md' },
  'preview.driveReference': { glyph: 'chat', colorRole: 'brand', sizeRole: 'md' },

  'chatHome.openDirectory': { glyph: 'folder_open', colorRole: 'brand', sizeRole: 'lg' },
  'chatHome.search': { glyph: 'search', colorRole: 'brand', sizeRole: 'lg' },
  'chatHome.add': { glyph: 'edit_square', colorRole: 'brand', sizeRole: 'md' },
  'chatHome.rowPinned': {
    glyph: 'pin',
    colorRole: 'tertiary',
    sizeRole: 'pinMarker',
  },
  'chatHome.pinnedFold.leading': { glyph: 'list_arrow', colorRole: 'tertiary', sizeRole: 'md' },
  'chatHome.pinnedFold.expand': { glyph: 'keyboard_arrow_down', colorRole: 'tertiary', sizeRole: 'md' },
  'chatHome.pinnedFold.collapse': { glyph: 'keyboard_arrow_up', colorRole: 'tertiary', sizeRole: 'md' },
  'chatHome.pinMenu.toggle': { glyph: 'pin', colorRole: 'primary', sizeRole: 'sm' },
  'chatHome.pinMenu.markRead': { glyph: 'done_all', colorRole: 'primary', sizeRole: 'sm' },

  'chatDetail.back': { glyph: 'chevron_left', colorRole: 'brand', sizeRole: 'xxl' },
  'chatDetail.newConversation': {
    glyph: 'edit_square',
    colorRole: 'brand',
    sizeRole: 'md',
  },
  'chatDetail.openHistory': {
    glyph: 'menu',
    colorRole: 'brand',
    sizeRole: 'md',
  },
  'chatDetail.wondersRefresh': {
    glyph: 'refresh',
    colorRole: 'brand',
    sizeRole: 'sm',
  },

  'settings.cache': { glyph: 'history', colorRole: 'brand', sizeRole: 'md' },
  'settings.developer': { glyph: 'tool', colorRole: 'brand', sizeRole: 'md' },
  'settings.openPanel': { glyph: 'spark', colorRole: 'brand', sizeRole: 'md' },
  'settings.language': { glyph: 'chat', colorRole: 'brand', sizeRole: 'md' },
  'settings.theme': { glyph: 'moon', colorRole: 'brand', sizeRole: 'md' },
  'settings.selected': { glyph: 'check', colorRole: 'brand', sizeRole: 'md' },

  'composer.attach': { glyph: 'add', colorRole: 'secondary', sizeRole: 'md' },
  'composer.plan': { glyph: 'checklist', colorRole: 'primary', sizeRole: 'md' },
  'composer.planActive': { glyph: 'checklist', colorRole: 'brand', sizeRole: 'md' },
  'composer.attachImage': { glyph: 'image', colorRole: 'brand', sizeRole: 'sm' },
  'composer.attachFile': { glyph: 'draft', colorRole: 'success', sizeRole: 'sm' },
  'composer.send': { glyph: 'arrow_upward', colorRole: 'onBrandAction', sizeRole: 'md' },
  'composer.stop': { glyph: 'stop_circle', colorRole: 'onBrandAction', sizeRole: 'md' },
  'composer.resume': { glyph: 'play_circle', colorRole: 'onBrandAction', sizeRole: 'md' },

  'directoryPicker.startConversation': {
    glyph: 'edit_square',
    colorRole: 'brand',
    sizeRole: 'md',
  },
  'directoryPicker.close': { glyph: 'close', colorRole: 'primary', sizeRole: 'md' },

  'historyDrawer.markAllRead': { glyph: 'done_all', colorRole: 'brand', sizeRole: 'sm' },
  'historyDrawer.close': { glyph: 'close', colorRole: 'primary', sizeRole: 'md' },

  'timeline.defaultRail': { glyph: 'smart_toy', colorRole: 'brand', sizeRole: 'rail' },
  'timeline.requestRail': { glyph: 'reply', colorRole: 'brand', sizeRole: 'rail' },
  'timeline.assistantContentRail': {
    glyph: 'description',
    colorRole: 'success',
    sizeRole: 'rail',
  },
  'timeline.systemAlertRail': { glyph: 'warning', colorRole: 'warning', sizeRole: 'rail' },
  'timeline.copy': { glyph: 'content_copy', colorRole: 'secondary', sizeRole: 'toolbar' },
  'timeline.reask': { glyph: 'refresh', colorRole: 'secondary', sizeRole: 'toolbar' },
  'timeline.reaskNewConversation': { glyph: 'open_in_new', colorRole: 'primary', sizeRole: 'toolbar' },
  'timeline.scrollToEnd': {
    glyph: 'keyboard_arrow_down',
    colorRole: 'primary',
    sizeRole: 'md',
  },

  'runtime.reasoning': { glyph: 'psychology', colorRole: 'warning', sizeRole: 'rail' },
  'runtime.awaiting': { glyph: 'question_answer', colorRole: 'warning', sizeRole: 'rail' },
  'runtime.tool': { glyph: 'build', colorRole: 'brand', sizeRole: 'rail' },
  'runtime.planning': { glyph: 'assignment', colorRole: 'brand', sizeRole: 'rail' },
  'runtime.file': { glyph: 'description', colorRole: 'success', sizeRole: 'rail' },
  'runtime.neutral': { glyph: 'smart_toy', colorRole: 'secondary', sizeRole: 'rail' },
  'runtime.expand': {
    glyph: 'chevron_right',
    colorRole: 'secondary',
    sizeRole: 'fold',
  },
  'runtime.collapse': {
    glyph: 'expand_more',
    colorRole: 'secondary',
    sizeRole: 'fold',
  },
  'runtime.wrapEnabled': { glyph: 'format_text_wrap', colorRole: 'secondary', sizeRole: 'toolbar' },
  'runtime.wrapDisabled': { glyph: 'format_text_overflow', colorRole: 'secondary', sizeRole: 'toolbar' },
  'runtime.copy': { glyph: 'content_copy', colorRole: 'secondary', sizeRole: 'toolbar' },
  'runtime.planExpand': { glyph: 'keyboard_arrow_down', colorRole: 'secondary', sizeRole: 'toolbar' },
  'runtime.planCollapse': { glyph: 'keyboard_arrow_up', colorRole: 'secondary', sizeRole: 'toolbar' },

  'awaiting.resume': { glyph: 'spark', colorRole: 'brandStrong', sizeRole: 'sm', strokeWidth: 2.1 },
  'attachment.image': { glyph: 'image', colorRole: 'secondary', sizeRole: 'md' },
  'attachment.fileGeneric': { glyph: 'draft', colorRole: 'brand', sizeRole: 'sm' },
  'attachment.filePdf': { glyph: 'picture_as_pdf', colorRole: 'brand', sizeRole: 'sm' },
  'attachment.fileSheet': { glyph: 'table_chart', colorRole: 'brand', sizeRole: 'sm' },
  'attachment.filePresentation': { glyph: 'slideshow', colorRole: 'brand', sizeRole: 'sm' },
  'attachment.fileArchive': { glyph: 'folder_zip', colorRole: 'brand', sizeRole: 'sm' },
  'attachment.fileDocument': { glyph: 'article', colorRole: 'brand', sizeRole: 'sm' },
  'attachment.fileText': { glyph: 'description', colorRole: 'brand', sizeRole: 'sm' },
  'attachment.remove': { glyph: 'close', colorRole: 'primary', sizeRole: 'sm' },
  'team.avatarFallback': { glyph: 'person', colorRole: 'onBrandAction', sizeRole: 'md' },
  'usage.close': { glyph: 'close', colorRole: 'secondary', sizeRole: 'sm' },
} as const satisfies Record<string, AppIconUsageConfig>;

export type AppIconUsage = keyof typeof appIconUsages;
