import * as Clipboard from 'expo-clipboard';
import { Alert } from 'react-native';
import { act, create } from 'react-test-renderer';
import { THEMES } from '../../../core/constants/theme';
import { TerminalSessionListPane } from '../components/TerminalSessionListPane';

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(() => Promise.resolve())
}));

describe('TerminalSessionListPane', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('shows current webview url in footer', () => {
    const currentUrl = 'https://demo.example.com/appterm?sessionId=session-1&foo=bar';
    let tree: ReturnType<typeof create> | null = null;
    act(() => {
      tree = create(
        <TerminalSessionListPane
          theme={THEMES.light}
          loading={false}
          error=""
          sessions={[{ sessionId: 'session-1', title: 'Session 1' }]}
          activeSessionId="session-1"
          currentWebViewUrl={currentUrl}
          onCreateSession={() => {}}
          onRefresh={() => {}}
          onSelectSession={() => {}}
        />
      );
    });

    const footer = tree!.root.findByProps({ testID: 'terminal-current-url-footer' });
    expect(footer).toBeTruthy();
    const urlText = tree!.root.findByProps({ testID: 'terminal-current-url-text' });
    expect(urlText.props.children).toBe(currentUrl);

    act(() => {
      tree?.unmount();
    });
  });

  it('copies full current webview url when copy button is pressed', async () => {
    const currentUrl = 'https://demo.example.com/appterm?sessionId=session-2&openNewSession=1';
    let tree: ReturnType<typeof create> | null = null;
    act(() => {
      tree = create(
        <TerminalSessionListPane
          theme={THEMES.light}
          loading={false}
          error=""
          sessions={[]}
          activeSessionId=""
          currentWebViewUrl={currentUrl}
          onCreateSession={() => {}}
          onRefresh={() => {}}
          onSelectSession={() => {}}
        />
      );
    });

    const copyBtn = tree!.root.findByProps({ testID: 'terminal-current-url-copy-btn' });
    await act(async () => {
      await copyBtn.props.onPress();
    });

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(currentUrl);
    expect(Alert.alert).toHaveBeenCalledWith('已复制', '当前终端地址已复制到剪贴板');

    act(() => {
      tree?.unmount();
    });
  });
});
