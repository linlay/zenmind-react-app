import { Pressable, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { AppErrorBoundary } from '../AppErrorBoundary';

describe('AppErrorBoundary', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders fallback and retries successfully after a render crash', () => {
    function CrashControlled({ shouldThrow }: { shouldThrow: boolean }) {
      if (shouldThrow) {
        throw new Error('boom');
      }
      return <Text>safe content</Text>;
    }

    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <AppErrorBoundary>
          <CrashControlled shouldThrow />
        </AppErrorBoundary>
      );
    });

    expect(JSON.stringify(tree!.toJSON())).toContain('页面出错了');

    act(() => {
      tree!.update(
        <AppErrorBoundary>
          <CrashControlled shouldThrow={false} />
        </AppErrorBoundary>
      );
    });

    act(() => {
      tree!.root.findAll((node) => typeof node.props?.onPress === 'function')[0].props.onPress();
    });

    expect(JSON.stringify(tree!.toJSON())).toContain('safe content');
  });

  it('calls safe-screen reset callback from fallback action', () => {
    const onResetToSafeScreen = jest.fn();

    function CrashAlways() {
      throw new Error('fatal');
      return <Text />;
    }

    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <AppErrorBoundary onResetToSafeScreen={onResetToSafeScreen}>
          <CrashAlways />
        </AppErrorBoundary>
      );
    });

    act(() => {
      tree!.root.findAll((node) => typeof node.props?.onPress === 'function')[1].props.onPress();
    });

    expect(onResetToSafeScreen).toHaveBeenCalledTimes(1);
  });
});
