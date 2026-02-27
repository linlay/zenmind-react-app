import { useMemo } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

interface SwipeBackEdgeProps {
  enabled?: boolean;
  onBack: () => void;
  edgeWidth?: number;
  thresholdDx?: number;
  thresholdVx?: number;
}

export function SwipeBackEdge({
  enabled = true,
  onBack,
  edgeWidth = 24,
  thresholdDx = 72,
  thresholdVx = 0.6
}: SwipeBackEdgeProps) {
  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gestureState) => {
          if (!enabled) {
            return false;
          }
          const horizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.2;
          return gestureState.x0 <= edgeWidth && gestureState.dx > 8 && horizontal;
        },
        onPanResponderRelease: (_event, gestureState) => {
          if (!enabled) {
            return;
          }
          if (gestureState.dx > thresholdDx || gestureState.vx > thresholdVx) {
            onBack();
          }
        }
      }),
    [edgeWidth, enabled, onBack, thresholdDx, thresholdVx]
  );

  return (
    <View
      pointerEvents={enabled ? 'auto' : 'none'}
      style={[styles.edge, { width: edgeWidth }]}
      {...responder.panHandlers}
      testID="swipe-back-edge"
    />
  );
}

const styles = StyleSheet.create({
  edge: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 9
  }
});
