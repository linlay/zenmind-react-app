import React from 'react';
import { View } from 'react-native';
import { act, create } from 'react-test-renderer';
import { UserSettingsScreen } from '../UserSettingsScreen';

const mockDispatch = jest.fn();
let mockSelectorState: Record<string, any> = {};

jest.mock('../../../../app/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: Record<string, any>) => unknown) => selector(mockSelectorState)
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {})
  }
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => {
    const ReactLocal = require('react');
    const { View: ViewLocal } = require('react-native');
    return ReactLocal.createElement(ViewLocal, null, children);
  }
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(() => Promise.resolve())
}));

describe('UserSettingsScreen', () => {
  beforeEach(() => {
    mockDispatch.mockClear();
    mockSelectorState = {
      user: {
        endpointDraft: 'demo.example.com',
        ptyUrlDraft: 'https://demo.example.com/appterm',
        endpointInput: 'demo.example.com',
        ptyUrlInput: 'https://demo.example.com/appterm'
      }
    };
  });

  it('renders account management card and submits add-account form', async () => {
    const onSubmitLogin = jest.fn(() => Promise.resolve());
    let tree: ReturnType<typeof create> | null = null;
    await act(async () => {
      tree = create(
        <UserSettingsScreen
          theme={{
            mode: 'light',
            surfaceStrong: '#222',
            surface: '#111',
            text: '#fff',
            textMute: '#999',
            textSoft: '#888',
            primary: '#0af',
            primaryDeep: '#08c',
            danger: '#f33',
            border: '#333'
          }}
          username="tester"
          deviceName="phone"
          accessToken="token"
          versionLabel="1.0.0"
          savedAccounts={[
            {
              accountId: 'acct-1',
              username: 'tester',
              deviceId: 'dev-1',
              deviceName: 'phone',
              endpointInput: 'demo.example.com',
              ptyUrlInput: 'https://demo.example.com/appterm',
              lastUsedAtMs: 1
            }
          ]}
          activeAccountId="acct-1"
          accountSwitching={false}
          loginEndpointDraft="demo.example.com"
          loginDeviceName="tablet"
          loginMasterPassword="secret"
          loginAuthError=""
          canSubmitLogin
          onClearChatCache={jest.fn(() => Promise.resolve())}
          onLogout={jest.fn()}
          onSwitchAccount={jest.fn(() => Promise.resolve({ success: true }))}
          onRemoveAccount={jest.fn(() => Promise.resolve())}
          onSetLoginEndpointDraft={jest.fn()}
          onSetLoginDeviceName={jest.fn()}
          onSetLoginMasterPassword={jest.fn()}
          onSetLoginAuthError={jest.fn()}
          onSubmitLogin={onSubmitLogin}
        />
      );
      await Promise.resolve();
    });

    expect((tree as ReturnType<typeof create>).root.findByProps({ testID: 'account-settings-card' })).toBeTruthy();

    act(() => {
      (tree as ReturnType<typeof create>).root.findByProps({ testID: 'toggle-add-account-form-btn' }).props.onPress();
    });

    await act(async () => {
      (tree as ReturnType<typeof create>).root.findByProps({ testID: 'settings-add-account-submit-btn' }).props.onPress();
      await Promise.resolve();
    });

    expect(onSubmitLogin).toHaveBeenCalledTimes(1);
  });
});
