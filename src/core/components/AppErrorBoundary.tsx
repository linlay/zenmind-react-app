import { Component, ErrorInfo, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface AppErrorBoundaryProps {
  children: ReactNode;
  onResetToSafeScreen?: () => void;
}

interface AppErrorBoundaryState {
  error: Error | null;
  retryNonce: number;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null,
    retryNonce: 0
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      error,
      retryNonce: 0
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[AppErrorBoundary]', error, errorInfo.componentStack);
  }

  private reset = () => {
    this.setState((prev) => ({
      error: null,
      retryNonce: prev.retryNonce + 1
    }));
  };

  render() {
    if (!this.state.error) {
      return <View style={styles.fill}>{this.props.children}</View>;
    }

    return (
      <View style={styles.wrap}>
        <View style={styles.card}>
          <Text style={styles.title}>页面出错了</Text>
          <Text style={styles.message} numberOfLines={4}>
            {this.state.error.message || 'unknown error'}
          </Text>
          <Pressable style={styles.primaryButton} onPress={this.reset}>
            <Text style={styles.primaryButtonText}>重试</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={this.props.onResetToSafeScreen}>
            <Text style={styles.secondaryButtonText}>返回安全页</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  fill: {
    flex: 1
  },
  wrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: '#f7f9fc'
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    padding: 18,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d5dfef',
    backgroundColor: '#ffffff'
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#27334a'
  },
  message: {
    fontSize: 13,
    lineHeight: 19,
    color: '#60728f'
  },
  primaryButton: {
    minHeight: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2f6cf3'
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff'
  },
  secondaryButton: {
    minHeight: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d5dfef',
    backgroundColor: '#ffffff'
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#27334a'
  }
});
