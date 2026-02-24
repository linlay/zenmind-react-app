import React from 'react';
import renderer, { act } from 'react-test-renderer';
import * as ReactNative from 'react-native';
import { TimelineEntryRow } from '../components/TimelineEntryRow';
import { authorizedFetch } from '../../../core/auth/appAuth';

const { Image } = ReactNative;
const mockMarkdownRender = jest.fn();

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

  function MockMarkdown(props: { children?: unknown; rules?: Record<string, Function> }) {
    const text = String(props.children || '');
    mockMarkdownRender(text);

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

function buildAssistantItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'assistant-1',
    kind: 'message',
    role: 'assistant',
    text: '![示例](/data/sample_photo.jpg)',
    ts: Date.now(),
    ...overrides
  } as any;
}

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function flushWait(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

async function renderRow(options?: { item?: any; chatImageToken?: string; onImageAuthError?: () => void }) {
  const onImageAuthError = options?.onImageAuthError || jest.fn();
  const item = options?.item || buildAssistantItem();
  let tree: renderer.ReactTestRenderer | null = null;
  await act(async () => {
    tree = renderer.create(
      <TimelineEntryRow
        item={item}
        theme={theme}
        contentWidth={390}
        backendUrl="https://api.example.com"
        chatImageToken={options?.chatImageToken ?? 'chat-token-1'}
        toolExpanded={false}
        onToggleTool={() => {}}
        onToggleReasoning={() => {}}
        onCopyText={() => {}}
        onImageAuthError={onImageAuthError}
      />
    );
  });
  await flushAsync();
  return { tree: tree as renderer.ReactTestRenderer, onImageAuthError };
}

describe('TimelineEntryRow markdown image token behavior', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockAuthorizedFetch.mockReset();
    mockMarkdownRender.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders relative markdown image with signed token query and no auth header', async () => {
    const { tree } = await renderRow();
    const image = tree.root.findByType(Image);
    expect(image.props.source?.uri).toContain('/api/ap/data?file=%2Fdata%2Fsample_photo.jpg&t=chat-token-1');
    expect(image.props.source?.headers).toBeUndefined();
    expect(mockAuthorizedFetch).not.toHaveBeenCalled();
    await act(async () => {
      tree.unmount();
    });
  });

  it('shows fallback when relative image token is missing', async () => {
    const { tree } = await renderRow({ chatImageToken: '' });

    expect(tree.root.findAllByProps({ testID: 'markdown-image-fallback' }).length).toBeGreaterThan(0);

    await act(async () => {
      tree.unmount();
    });
  });

  it('updates image url when chatImageToken changes', async () => {
    const item = buildAssistantItem();
    const { tree } = await renderRow({ item, chatImageToken: 'chat-token-1' });

    const before = tree.root.findByType(Image);
    expect(before.props.source?.uri).toContain('t=chat-token-1');

    await act(async () => {
      tree.update(
        <TimelineEntryRow
          item={item}
          theme={theme}
          contentWidth={390}
          backendUrl="https://api.example.com"
          chatImageToken="chat-token-2"
          toolExpanded={false}
          onToggleTool={() => {}}
          onToggleReasoning={() => {}}
          onCopyText={() => {}}
          onImageAuthError={() => {}}
        />
      );
    });

    const after = tree.root.findByType(Image);
    expect(after.props.source?.uri).toContain('t=chat-token-2');

    await act(async () => {
      tree.unmount();
    });
  });

  it('notifies auth error callback when signed image returns 403/401-like error', async () => {
    const onImageAuthError = jest.fn();
    const { tree } = await renderRow({ onImageAuthError });
    const image = tree.root.findByType(Image);
    await act(async () => {
      image.props.onError?.({ nativeEvent: { error: 'HTTP 403 forbidden' } });
    });
    expect(onImageAuthError).toHaveBeenCalledTimes(1);

    await act(async () => {
      tree.unmount();
    });
  });

  it('does not notify auth error callback on non-auth image errors', async () => {
    const onImageAuthError = jest.fn();
    const { tree } = await renderRow({ onImageAuthError });
    const image = tree.root.findByType(Image);
    await act(async () => {
      image.props.onError?.({ nativeEvent: { error: 'network timeout' } });
    });
    expect(onImageAuthError).toHaveBeenCalledTimes(0);

    await act(async () => {
      tree.unmount();
    });
  });

  it('keeps frozen markdown blocks from re-rendering while tail block updates in streaming', async () => {
    const initialItem = buildAssistantItem({
      text: '第一段\n\n第二',
      isStreamingContent: true
    });
    const nextItem = {
      ...initialItem,
      text: '第一段\n\n第二段继续'
    };
    const onImageAuthError = jest.fn();

    const { tree } = await renderRow({ item: initialItem, onImageAuthError });
    expect(mockMarkdownRender.mock.calls.length).toBeGreaterThanOrEqual(2);

    mockMarkdownRender.mockClear();
    await act(async () => {
      tree.update(
        <TimelineEntryRow
          item={nextItem}
          theme={theme}
          contentWidth={390}
          backendUrl="https://api.example.com"
          chatImageToken="chat-token-1"
          toolExpanded={false}
          onToggleTool={() => {}}
          onToggleReasoning={() => {}}
          onCopyText={() => {}}
          onImageAuthError={onImageAuthError}
        />
      );
    });

    const renderedContents = mockMarkdownRender.mock.calls.map((call) => String(call[0] || ''));
    expect(renderedContents.some((content) => content.includes('第一段'))).toBe(false);
    expect(renderedContents.some((content) => content.includes('第二段继续'))).toBe(true);

    await act(async () => {
      tree.unmount();
    });
  });

  it('shows placeholder for relative image in streaming tail block', async () => {
    const streamingItem = buildAssistantItem({
      text: '![示例](/data/sample_photo.jpg)',
      isStreamingContent: true
    });

    const { tree } = await renderRow({ item: streamingItem });

    expect(tree.root.findAllByType(Image).length).toBe(0);
    expect(tree.root.findAllByProps({ testID: 'markdown-image-deferred-placeholder' }).length).toBeGreaterThan(0);

    await act(async () => {
      tree.unmount();
    });
  });

  it('renders relative image immediately once image paragraph ends with single newline while streaming', async () => {
    const streamingItem = buildAssistantItem({
      text: '![示例](/data/sample_photo.jpg)\n',
      isStreamingContent: true
    });

    const { tree } = await renderRow({ item: streamingItem });

    expect(tree.root.findAllByProps({ testID: 'markdown-image-deferred-placeholder' }).length).toBe(0);
    expect(tree.root.findAllByType(Image).length).toBeGreaterThan(0);

    await act(async () => {
      tree.unmount();
    });
  });

  it('renders completed list-item image before content.end when later list item is still streaming', async () => {
    const streamingItem = buildAssistantItem({
      text: ['1. **示例照片**  ', '   ![示例照片](/data/sample_photo.jpg)', '', '2. **示例架构图**'].join('\n'),
      isStreamingContent: true
    });

    const { tree } = await renderRow({ item: streamingItem });

    expect(tree.root.findAllByType(Image).length).toBeGreaterThan(0);
    expect(tree.root.findAllByProps({ testID: 'markdown-image-deferred-placeholder' }).length).toBe(0);

    await act(async () => {
      tree.unmount();
    });
  });

  it('loads relative image after streaming block is frozen', async () => {
    const streamingItem = buildAssistantItem({
      text: '![示例](/data/sample_photo.jpg)',
      isStreamingContent: true
    });

    const { tree } = await renderRow({ item: streamingItem });
    expect(tree.root.findAllByType(Image).length).toBe(0);

    await act(async () => {
      tree.update(
        <TimelineEntryRow
          item={{ ...streamingItem, isStreamingContent: false }}
          theme={theme}
          contentWidth={390}
          backendUrl="https://api.example.com"
          chatImageToken="chat-token-1"
          toolExpanded={false}
          onToggleTool={() => {}}
          onToggleReasoning={() => {}}
          onCopyText={() => {}}
          onImageAuthError={() => {}}
        />
      );
    });

    expect(tree.root.findAllByProps({ testID: 'markdown-image-deferred-placeholder' }).length).toBe(0);
    expect(tree.root.findAllByType(Image).length).toBeGreaterThan(0);

    await act(async () => {
      tree.unmount();
    });
  });

  it('still loads absolute image immediately in streaming tail block', async () => {
    const streamingItem = buildAssistantItem({
      text: '![示例](https://cdn.example.com/demo.png)',
      isStreamingContent: true
    });

    const { tree } = await renderRow({ item: streamingItem });

    expect(tree.root.findAllByProps({ testID: 'markdown-image-deferred-placeholder' }).length).toBe(0);
    expect(tree.root.findAllByType(Image).length).toBeGreaterThan(0);

    await act(async () => {
      tree.unmount();
    });
  });

  it('retries transient auth-like failure for relative image in streaming frozen block and succeeds without reporting auth error', async () => {
    const onImageAuthError = jest.fn();
    const streamingItem = buildAssistantItem({
      text: ['1. 图', '![示例](/data/sample_photo.jpg)', '', '2. 后续内容'].join('\n'),
      isStreamingContent: true
    });

    const { tree } = await renderRow({ item: streamingItem, onImageAuthError });
    const image = tree.root.findByType(Image);
    expect(image.props.source?.uri).not.toContain('__rmn=');

    await act(async () => {
      image.props.onError?.({ nativeEvent: { error: 'HTTP 403 forbidden' } });
    });

    expect(onImageAuthError).toHaveBeenCalledTimes(0);
    expect(tree.root.findAllByProps({ testID: 'markdown-image-fallback' }).length).toBe(0);

    await flushWait(220);
    const retriedImage = tree.root.findByType(Image);
    expect(String(retriedImage.props.source?.uri || '')).toContain('__rmn=1');
    expect(onImageAuthError).toHaveBeenCalledTimes(0);

    await act(async () => {
      tree.unmount();
    });
  });

  it('reports auth error only after exhausting retries for relative image in streaming frozen block', async () => {
    const onImageAuthError = jest.fn();
    const streamingItem = buildAssistantItem({
      text: ['1. 图', '![示例](/data/sample_photo.jpg)', '', '2. 后续内容'].join('\n'),
      isStreamingContent: true
    });

    const { tree } = await renderRow({ item: streamingItem, onImageAuthError });

    const image1 = tree.root.findByType(Image);
    await act(async () => {
      image1.props.onError?.({ nativeEvent: { error: 'HTTP 403 forbidden' } });
    });
    await flushWait(220);

    const image2 = tree.root.findByType(Image);
    await act(async () => {
      image2.props.onError?.({ nativeEvent: { error: 'HTTP 401 unauthorized' } });
    });
    await flushWait(470);

    const image3 = tree.root.findByType(Image);
    await act(async () => {
      image3.props.onError?.({ nativeEvent: { error: 'token expired' } });
    });
    await flushWait(920);

    const image4 = tree.root.findByType(Image);
    await act(async () => {
      image4.props.onError?.({ nativeEvent: { error: 'signature invalid' } });
    });

    expect(onImageAuthError).toHaveBeenCalledTimes(1);
    expect(tree.root.findAllByProps({ testID: 'markdown-image-fallback' }).length).toBeGreaterThan(0);

    await act(async () => {
      tree.unmount();
    });
  });

  it('does not retry absolute image auth-like failure in streaming frozen block', async () => {
    const onImageAuthError = jest.fn();
    const streamingItem = buildAssistantItem({
      text: ['1. 图', '![示例](https://cdn.example.com/demo.png)', '', '2. 后续内容'].join('\n'),
      isStreamingContent: true
    });

    const { tree } = await renderRow({ item: streamingItem, onImageAuthError });
    const image = tree.root.findByType(Image);

    await act(async () => {
      image.props.onError?.({ nativeEvent: { error: 'HTTP 403 forbidden' } });
    });

    expect(onImageAuthError).toHaveBeenCalledTimes(0);
    expect(tree.root.findAllByProps({ testID: 'markdown-image-fallback' }).length).toBeGreaterThan(0);

    await flushWait(250);
    const fallbackImages = tree.root.findAllByType(Image);
    if (fallbackImages.length) {
      expect(String(fallbackImages[0].props.source?.uri || '')).not.toContain('__rmn=');
    }

    await act(async () => {
      tree.unmount();
    });
  });

  it('does not flicker image when transitioning from streaming to non-streaming', async () => {
    const streamingItem = buildAssistantItem({
      text: '![示例](/data/sample_photo.jpg)\n',
      isStreamingContent: true
    });

    const { tree } = await renderRow({ item: streamingItem });
    expect(tree.root.findAllByType(Image).length).toBeGreaterThan(0);

    mockMarkdownRender.mockClear();
    const finalItem = { ...streamingItem, isStreamingContent: false };
    await act(async () => {
      tree.update(
        <TimelineEntryRow
          item={finalItem}
          theme={theme}
          contentWidth={390}
          backendUrl="https://api.example.com"
          chatImageToken="chat-token-1"
          toolExpanded={false}
          onToggleTool={() => {}}
          onToggleReasoning={() => {}}
          onCopyText={() => {}}
          onImageAuthError={() => {}}
        />
      );
    });

    expect(tree.root.findAllByType(Image).length).toBeGreaterThan(0);
    expect(tree.root.findAllByProps({ testID: 'markdown-image-fallback' }).length).toBe(0);
    expect(tree.root.findAllByProps({ testID: 'markdown-image-deferred-placeholder' }).length).toBe(0);

    await act(async () => {
      tree.unmount();
    });
  });

  it('protects frozen image block when subsequent text arrives without blank line separator', async () => {
    const step1Item = buildAssistantItem({
      text: '![示例](/data/sample_photo.jpg)\n',
      isStreamingContent: true
    });

    const { tree } = await renderRow({ item: step1Item });
    expect(tree.root.findAllByType(Image).length).toBeGreaterThan(0);

    const step2Item = {
      ...step1Item,
      text: '![示例](/data/sample_photo.jpg)\n这是一张示例图片'
    };
    await act(async () => {
      tree.update(
        <TimelineEntryRow
          item={step2Item}
          theme={theme}
          contentWidth={390}
          backendUrl="https://api.example.com"
          chatImageToken="chat-token-1"
          toolExpanded={false}
          onToggleTool={() => {}}
          onToggleReasoning={() => {}}
          onCopyText={() => {}}
          onImageAuthError={() => {}}
        />
      );
    });

    expect(tree.root.findAllByType(Image).length).toBeGreaterThan(0);

    await act(async () => {
      tree.unmount();
    });
  });
});
