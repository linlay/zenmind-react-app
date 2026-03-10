import React from 'react';
import { View } from 'react-native';
import { act, create } from 'react-test-renderer';
import { LoginScreen } from '../LoginScreen';

jest.mock('react-native-safe-area-context', () => {
  const ReactLocal = require('react');
  const { View: ViewLocal } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => ReactLocal.createElement(ViewLocal, null, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })
  };
});

jest.mock('../../hooks/useAppTheme', () => ({
  useAppTheme: () => ({
    surface: '#111',
    surfaceStrong: '#222',
    text: '#fff',
    textMute: '#999',
    primary: '#0af',
    primaryDeep: '#08c',
    danger: '#f33',
    border: '#333'
  })
}));

describe('LoginScreen', () => {
  it('renders saved accounts and triggers account switch', async () => {
    const controller = {
      endpointDraft: 'demo.example.com',
      deviceName: 'device',
      masterPassword: '',
      authError: '',
      canSubmitLogin: true,
      appVersionLabel: '1.0.0',
      isSubmitting: false,
      savedAccounts: [
        {
          accountId: 'acct-1',
          username: 'tester',
          deviceId: 'dev-1',
          deviceName: 'phone',
          endpointInput: 'demo.example.com',
          ptyUrlInput: 'https://demo.example.com/appterm',
          lastUsedAtMs: 1
        }
      ],
      activeAccountId: '',
      isSwitchingAccount: false,
      setEndpointDraftText: jest.fn(),
      setDeviceName: jest.fn(),
      setMasterPassword: jest.fn(),
      setAuthError: jest.fn(),
      submitLogin: jest.fn(() => Promise.resolve({ success: true })),
      switchToSavedAccount: jest.fn(() => Promise.resolve({ success: true })),
      removeSavedAccount: jest.fn(() => Promise.resolve())
    };

    let tree: ReturnType<typeof create> | null = null;
    await act(async () => {
      tree = create(<LoginScreen controller={controller as any} />);
      await Promise.resolve();
    });

    expect((tree as ReturnType<typeof create>).root.findByProps({ testID: 'saved-accounts-card' })).toBeTruthy();

    await act(async () => {
      (tree as ReturnType<typeof create>).root.findByProps({ testID: 'saved-account-switch-btn-0' }).props.onPress();
      await Promise.resolve();
    });

    expect(controller.switchToSavedAccount).toHaveBeenCalledWith('acct-1');
  });
});
