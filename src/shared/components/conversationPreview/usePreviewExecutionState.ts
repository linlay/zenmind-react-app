import { useCallback, useState } from 'react';

export function usePreviewExecutionState(onExecutionError?: () => void) {
  const [error, setError] = useState('');
  const [retryNonce, setRetryNonce] = useState(0);
  const handleError = useCallback(
    (message: string) => {
      setError(message);
      onExecutionError?.();
    },
    [onExecutionError]
  );
  const handleReady = useCallback(() => setError(''), []);
  const handleRetry = useCallback(() => {
    setError('');
    setRetryNonce((value) => value + 1);
  }, []);

  return { error, handleError, handleReady, handleRetry, retryNonce };
}
