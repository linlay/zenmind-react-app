import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

interface LoadingOverlayProps {
  text?: string;
  color?: string;
}

export function LoadingOverlay({ text = '加载中...', color = '#2f6cf3' }: LoadingOverlayProps) {
  return (
    <View style={styles.overlay}>
      <ActivityIndicator size="small" color={color} />
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8
  },
  text: {
    fontSize: 13,
    color: '#60728f'
  }
});
