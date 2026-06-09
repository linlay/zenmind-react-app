import type { AppIconGlyphName } from './appIconRegistry';

export type AppIconColorRole =
  | 'brand'
  | 'brandStrong'
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'surface'
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

  'chatHome.openDirectory': { glyph: 'menu', colorRole: 'brand', sizeRole: 'lg' },
  'chatHome.search': { glyph: 'search', colorRole: 'brand', sizeRole: 'lg' },
  'chatHome.add': { glyph: 'add', colorRole: 'brand', sizeRole: 'xxl' },
  'chatHome.rowPinned': {
    glyph: 'pin',
    colorRole: 'tertiary',
    sizeRole: 'pinMarker',
  },
  'chatHome.pinnedFold.leading': { glyph: 'menu', colorRole: 'tertiary', sizeRole: 'md' },
  'chatHome.pinnedFold.expand': { glyph: 'chevron-down', colorRole: 'tertiary', sizeRole: 'md' },
  'chatHome.pinnedFold.collapse': { glyph: 'chevron-up', colorRole: 'tertiary', sizeRole: 'md' },
  'chatHome.pinMenu.toggle': { glyph: 'pin', colorRole: 'primary', sizeRole: 'sm' },
  'chatHome.pinMenu.markRead': { glyph: 'check', colorRole: 'primary', sizeRole: 'sm' },

  'chatDetail.back': { glyph: 'back', colorRole: 'brand', sizeRole: 'xxl' },
  'chatDetail.newConversation': {
    glyph: 'chat-add',
    colorRole: 'brand',
    sizeRole: 'md',
  },
  'chatDetail.openHistory': {
    glyph: 'menu',
    colorRole: 'brand',
    sizeRole: 'md',
  },

  'settings.cache': { glyph: 'history', colorRole: 'brand', sizeRole: 'md' },
  'settings.developer': { glyph: 'tool', colorRole: 'brand', sizeRole: 'md' },
  'settings.openPanel': { glyph: 'spark', colorRole: 'brand', sizeRole: 'md' },
  'settings.language': { glyph: 'chat', colorRole: 'brand', sizeRole: 'md' },
  'settings.theme': { glyph: 'moon', colorRole: 'brand', sizeRole: 'md' },
  'settings.selected': { glyph: 'check', colorRole: 'brand', sizeRole: 'md' },

  'composer.attach': { glyph: 'add', colorRole: 'secondary', sizeRole: 'md' },
  'composer.attachImage': { glyph: 'image', colorRole: 'brand', sizeRole: 'sm' },
  'composer.attachFile': { glyph: 'file', colorRole: 'success', sizeRole: 'sm' },
  'composer.send': { glyph: 'arrow-up', colorRole: 'surface', sizeRole: 'md' },
  'composer.stop': { glyph: 'stop', colorRole: 'surface', sizeRole: 'md' },
  'composer.resume': { glyph: 'play', colorRole: 'surface', sizeRole: 'md' },

  'directoryPicker.startConversation': {
    glyph: 'chat-add',
    colorRole: 'brand',
    sizeRole: 'md',
  },
  'directoryPicker.close': { glyph: 'close', colorRole: 'primary', sizeRole: 'md' },

  'historyDrawer.markAllRead': { glyph: 'check', colorRole: 'brand', sizeRole: 'sm' },
  'historyDrawer.close': { glyph: 'close', colorRole: 'primary', sizeRole: 'md' },

  'timeline.defaultRail': { glyph: 'chat', colorRole: 'brand', sizeRole: 'rail' },
  'timeline.requestRail': { glyph: 'steer', colorRole: 'brand', sizeRole: 'rail' },
  'timeline.assistantContentRail': {
    glyph: 'file',
    colorRole: 'success',
    sizeRole: 'rail',
  },
  'timeline.copy': { glyph: 'copy', colorRole: 'secondary', sizeRole: 'toolbar' },
  'timeline.scrollToEnd': {
    glyph: 'arrow-down',
    colorRole: 'primary',
    sizeRole: 'md',
  },

  'runtime.reasoning': { glyph: 'brain', colorRole: 'warning', sizeRole: 'rail' },
  'runtime.awaiting': { glyph: 'question', colorRole: 'warning', sizeRole: 'rail' },
  'runtime.tool': { glyph: 'tool', colorRole: 'brand', sizeRole: 'rail' },
  'runtime.file': { glyph: 'file', colorRole: 'success', sizeRole: 'rail' },
  'runtime.neutral': { glyph: 'chat', colorRole: 'secondary', sizeRole: 'rail' },
  'runtime.expand': {
    glyph: 'chevron-down',
    colorRole: 'secondary',
    sizeRole: 'fold',
  },
  'runtime.collapse': {
    glyph: 'chevron-up',
    colorRole: 'secondary',
    sizeRole: 'fold',
  },
  'runtime.wrap': { glyph: 'wrap-text', colorRole: 'secondary', sizeRole: 'toolbar' },
  'runtime.copy': { glyph: 'copy', colorRole: 'secondary', sizeRole: 'toolbar' },

  'awaiting.resume': { glyph: 'spark', colorRole: 'brandStrong', sizeRole: 'sm', strokeWidth: 2.1 },
  'team.avatarFallback': { glyph: 'apps', colorRole: 'surface', sizeRole: 'md' },
  'usage.close': { glyph: 'close', colorRole: 'secondary', sizeRole: 'sm' },
} as const satisfies Record<string, AppIconUsageConfig>;

export type AppIconUsage = keyof typeof appIconUsages;
