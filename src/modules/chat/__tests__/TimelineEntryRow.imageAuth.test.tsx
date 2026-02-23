import React from 'react';
import renderer, { act } from 'react-test-renderer';
import * as ReactNative from 'react-native';
import { TimelineEntryRow } from '../components/TimelineEntryRow';
import { authorizedFetch, getAccessToken } from '../../../core/auth/appAuth';

const { Image, Platform } = ReactNative;

jest.mock('../../../core/auth/appAuth', () => ({
  authorizedFetch: jest.fn(),
  getAccessToken: jest.fn()
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

  function MockMarkdown(props: { children?: unknown; rules?: Record<string, Function> }) {
    const text = String(props.children || '');
    const imageMatch = text.match(/!\[[^\]]*\]\(([^)]+)\)/);
    let rendered = null;
    if (imageMatch && props.rules?.image) {
      rendered = props.rules.image(
        { key: 'mock-image-node', attributes: { src: imageMatch[1], alt: 'mock-alt' } },
        null,
        null,
        { image: { width: 120, height: 80 } }
      );
    }
    return ReactLocal.createElement(View, { testID: 'mock-markdown' }, rendered);
  }

  return {
    __esModule: true,
    default: MockMarkdown
  };
});

const mockAuthorizedFetch = authorizedFetch as jest.MockedFunction<typeof authorizedFetch>;
const mockGetAccessToken = getAccessToken as jest.MockedFunction<typeof getAccessToken>;

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
  userBubble: ['#a', '#b'] as [string, string],
  systemBubble: '#eee'
};

const assistantItem = {
  id: 'assistant-1',
  kind: 'message',
  role: 'assistant',
  text: '![示例](/data/sample_photo.jpg)',
  ts: Date.now()
} as any;

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderRow() {
  let tree: renderer.ReactTestRenderer | null = null;
  await act(async () => {
    tree = renderer.create(
      <TimelineEntryRow
        item={assistantItem}
        theme={theme}
        contentWidth={390}
        backendUrl="https://api.example.com"
        toolExpanded={false}
        onToggleTool={() => {}}
        onToggleReasoning={() => {}}
        onCopyText={() => {}}
      />
    );
  });
  await flushAsync();
  return tree as renderer.ReactTestRenderer;
}

describe('TimelineEntryRow markdown image auth behavior', () => {
  const originalOs = Platform.OS;
  const originalCreateObjectURL = (globalThis as any)?.URL?.createObjectURL;
  const originalRevokeObjectURL = (globalThis as any)?.URL?.revokeObjectURL;

  beforeEach(() => {
    mockAuthorizedFetch.mockReset();
    mockGetAccessToken.mockReset();
    (globalThis as any).URL = (globalThis as any).URL || {};
    (globalThis as any).URL.createObjectURL = jest.fn(() => 'blob:preview-1');
    (globalThis as any).URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    (Platform as { OS: string }).OS = originalOs;
    if (originalCreateObjectURL) {
      (globalThis as any).URL.createObjectURL = originalCreateObjectURL;
    }
    if (originalRevokeObjectURL) {
      (globalThis as any).URL.revokeObjectURL = originalRevokeObjectURL;
    }
  });

  it('uses native Image headers with bearer token on android', async () => {
    (Platform as { OS: string }).OS = 'android';
    mockGetAccessToken.mockResolvedValue('token-1');

    const tree = await renderRow();
    const image = tree.root.findByType(Image);
    expect(image.props.source?.uri).toContain('/api/ap/data?file=%2Fdata%2Fsample_photo.jpg');
    expect(image.props.source?.headers?.Authorization).toBe('Bearer token-1');
    expect(mockAuthorizedFetch).not.toHaveBeenCalled();

    await act(async () => {
      tree.unmount();
    });
  });

  it('retries native token refresh once on image error', async () => {
    (Platform as { OS: string }).OS = 'android';
    mockGetAccessToken.mockResolvedValueOnce('token-1').mockResolvedValueOnce('token-2');

    const tree = await renderRow();
    const firstImage = tree.root.findByType(Image);
    expect(firstImage.props.source?.headers?.Authorization).toBe('Bearer token-1');

    await act(async () => {
      firstImage.props.onError?.({ nativeEvent: { error: '401' } });
    });
    await flushAsync();

    const secondImage = tree.root.findByType(Image);
    expect(secondImage.props.source?.headers?.Authorization).toBe('Bearer token-2');

    await act(async () => {
      secondImage.props.onError?.({ nativeEvent: { error: 'again' } });
    });
    await flushAsync();

    expect(mockGetAccessToken).toHaveBeenCalledTimes(2);

    await act(async () => {
      tree.unmount();
    });
  });

  it('falls back to resolved URL when web fetch fails', async () => {
    (Platform as { OS: string }).OS = 'web';
    mockAuthorizedFetch.mockRejectedValue(new Error('network error'));

    const tree = await renderRow();
    await flushAsync();

    const image = tree.root.findByType(Image);
    expect(image.props.source?.uri).toContain('/api/ap/data?file=%2Fdata%2Fsample_photo.jpg');

    await act(async () => {
      tree.unmount();
    });
  });

  it('reuses cached web preview without repeated authorized fetch on remount', async () => {
    (Platform as { OS: string }).OS = 'web';
    mockAuthorizedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => '' },
      blob: async () => new Blob(['abc'], { type: 'image/png' })
    } as unknown as Response);

    const firstTree = await renderRow();
    await flushAsync();
    expect(mockAuthorizedFetch).toHaveBeenCalledTimes(1);
    expect((globalThis as any).URL.createObjectURL).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstTree.unmount();
    });

    const secondTree = await renderRow();
    await flushAsync();
    expect(mockAuthorizedFetch).toHaveBeenCalledTimes(1);
    expect((globalThis as any).URL.createObjectURL).toHaveBeenCalledTimes(1);

    await act(async () => {
      secondTree.unmount();
    });
  });
});
