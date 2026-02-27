import React from 'react';
import { act, create } from 'react-test-renderer';
import { TimelineEntryRow } from '../components/TimelineEntryRow';

jest.mock('../../../core/auth/appAuth', () => ({
  authorizedFetch: jest.fn()
}));

jest.mock('expo-linear-gradient', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    LinearGradient: ({ children, ...props }: { children?: React.ReactNode }) =>
      ReactLocal.createElement(View, props, children)
  };
});

jest.mock('../components/ViewportBlockView', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    ViewportBlockView: () => ReactLocal.createElement(View, { testID: 'mock-viewport' })
  };
});

jest.mock('react-native-markdown-display', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: { children?: React.ReactNode }) =>
      ReactLocal.createElement(View, { testID: 'mock-markdown' }, children)
  };
});

const theme = {
  timelineLine: '#111',
  timelineDot: '#222',
  ok: '#00aa00',
  danger: '#cc0000',
  warn: '#cc8800',
  text: '#101010',
  textSoft: '#444444',
  textMute: '#666666',
  primary: '#0077ff',
  primaryDeep: '#0044aa',
  primarySoft: '#dde8ff',
  surfaceSoft: '#f5f5f5',
  surfaceStrong: '#efefef',
  systemBubble: '#eee',
  border: '#d0d8e5',
  userBubble: ['#a', '#b'] as [string, string]
};

describe('TimelineEntryRow run_end', () => {
  it('does not render unlock slider after run_end', () => {
    const runEndItem = {
      id: 'run-end-1',
      kind: 'message',
      role: 'system',
      variant: 'run_end',
      text: '本次运行结束',
      ts: Date.now()
    } as any;

    let tree: ReturnType<typeof create> | null = null;
    act(() => {
      tree = create(
        <TimelineEntryRow
          item={runEndItem}
          theme={theme as any}
          contentWidth={390}
          backendUrl="https://api.example.com"
          chatImageToken="chat-token"
          toolExpanded={false}
          onToggleTool={() => {}}
          onToggleReasoning={() => {}}
          onCopyText={() => {}}
          onImageAuthError={() => {}}
        />
      );
    });

    expect((tree as ReturnType<typeof create>).root.findAllByProps({ testID: 'run-end-unlock-track' })).toHaveLength(0);
    expect((tree as ReturnType<typeof create>).root.findByProps({ children: '-- 本次运行结束 --' })).toBeTruthy();
  });
});

