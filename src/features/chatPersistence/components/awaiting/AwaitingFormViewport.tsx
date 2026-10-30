import { forwardRef, memo, useEffect, useImperativeHandle, useRef } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import type { AwaitingFormViewportHandle, AwaitingFormViewportProps } from './AwaitingFormViewportTypes';
import { useAwaitingFormFrame } from './useAwaitingFormFrame';

const FormViewport = forwardRef<AwaitingFormViewportHandle, AwaitingFormViewportProps>(
  function FormViewport(props, ref) {
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const frame = useAwaitingFormFrame(props);
    frame.sendRef.current = (message) => iframeRef.current?.contentWindow?.postMessage(message, '*');
    useImperativeHandle(ref, () => ({ collect: frame.collect }), [frame.collect]);
    const handleMessage = frame.handleMessage;
    useEffect(() => {
      const receive = (event: MessageEvent) => {
        if (event.source === iframeRef.current?.contentWindow) handleMessage(event.data);
      };
      window.addEventListener('message', receive);
      return () => window.removeEventListener('message', receive);
    }, [handleMessage]);
    if (!frame.frameHtml)
      return (
        <View className="min-h-28 items-center justify-center">
          {frame.loading ? <ActivityIndicator /> : <Text className="text-app-danger">{frame.error}</Text>}
        </View>
      );
    return (
      <View
        className="overflow-hidden rounded-app-md border border-app-line bg-app-background"
        style={{ height: frame.height }}
      >
        <iframe
          key={frame.frameId}
          ref={iframeRef}
          title="Form"
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          srcDoc={frame.frameHtml}
          style={{ width: '100%', height: '100%', border: 0, background: 'transparent' }}
        />
      </View>
    );
  }
);
export const AwaitingFormViewport = memo(FormViewport);
