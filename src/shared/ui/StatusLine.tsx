import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

interface StatusLineProps {
  text?: string;
  loading?: boolean;
  color?: string;
}

export function StatusLine({ text, loading, color = '#2f6cf3' }: StatusLineProps) {
  if (!text && !loading) return null;

  return (
    <View style={styles.row}>
      <Text style={styles.text} numberOfLines={1}>{text || ''}</Text>
      {loading ? <ActivityIndicator size="small" color={color} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 8,
    gap: 8
  },
  text: {
    flex: 1,
    fontSize: 12,
    color: '#60728f'
  }
});
