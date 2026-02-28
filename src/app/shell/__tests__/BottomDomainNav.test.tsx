import { act, create } from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { THEMES } from '../../../core/constants/theme';
import { BottomDomainNav } from '../BottomDomainNav';

describe('BottomDomainNav', () => {
  it('renders four tabs and handles active or repeated press', () => {
    const onPressItem = jest.fn();
    let tree: ReturnType<typeof create> | null = null;
    act(() => {
      tree = create(<BottomDomainNav value="chat" theme={THEMES.light} onPressItem={onPressItem} />);
    });

    const chatTab = tree!.root.findByProps({ testID: 'bottom-nav-tab-chat' });
    const terminalTab = tree!.root.findByProps({ testID: 'bottom-nav-tab-terminal' });
    const agentsTab = tree!.root.findByProps({ testID: 'bottom-nav-tab-agents' });
    const userTab = tree!.root.findByProps({ testID: 'bottom-nav-tab-user' });

    expect(chatTab).toBeTruthy();
    expect(terminalTab).toBeTruthy();
    expect(agentsTab).toBeTruthy();
    expect(userTab).toBeTruthy();
    const chatContent = tree!.root.findByProps({ testID: 'bottom-nav-tab-content-chat' });
    const chatContentStyle = StyleSheet.flatten(chatContent.props.style) as { flexDirection?: string } | undefined;
    expect(chatContentStyle?.flexDirection).toBe('column');
    const iconWrap = tree!.root.findByProps({ testID: 'bottom-nav-tab-icon-wrap-chat' });
    const iconWrapStyle = StyleSheet.flatten(iconWrap.props.style) as { backgroundColor?: string } | undefined;
    expect(iconWrapStyle?.backgroundColor).toBeUndefined();

    act(() => {
      chatTab.props.onPress();
      terminalTab.props.onPress();
    });
    expect(onPressItem).toHaveBeenNthCalledWith(1, 'chat');
    expect(onPressItem).toHaveBeenNthCalledWith(2, 'terminal');

    act(() => {
      tree?.unmount();
    });
  });
});
