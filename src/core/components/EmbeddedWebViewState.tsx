import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

interface EmbeddedWebViewStateProps {
  loading: boolean;
  error: string;
  loadingText: string;
  errorTitle: string;
  errorDetail?: string;
  theme: {
    primary: string;
    textSoft: string;
    textMute: string;
    danger: string;
  };
}

export function EmbeddedWebViewState({
  loading,
  error,
  loadingText,
  errorTitle,
  errorDetail,
  theme
}: EmbeddedWebViewStateProps) {
  if (!loading && !error) {
    return null;
  }

  return (
    <View style={styles.overlay}>
      {loading && !error ? (
        <>
          <ActivityIndicator size="small" color={theme.primary} />
          <Text style={[styles.text, { color: theme.textSoft }]}>{loadingText}</Text>
        </>
      ) : null}

      {error ? (
        <>
          <Text style={[styles.text, { color: theme.danger }]}>{errorTitle}</Text>
          <Text style={[styles.text, { color: theme.textMute }]}>{error}</Text>
          {errorDetail ? <Text style={[styles.text, { color: theme.textMute }]}>{errorDetail}</Text> : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18
  },
  text: {
    fontSize: 12,
    textAlign: 'center'
  }
});
