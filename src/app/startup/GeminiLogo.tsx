import { useEffect } from 'react';
import type { ComponentProps } from 'react';
import { Defs, Image as SvgImage, Mask, Rect, Svg } from 'react-native-svg';
import {
  cancelAnimation,
  createAnimatedComponent,
  Easing,
  interpolate,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { brandAssets } from '../../shared/icons/brandAssets';

type GeminiLogoProps = {
  animated?: boolean;
  size: number;
};

type SvgRectProps = ComponentProps<typeof Rect>;

const AnimatedRect = createAnimatedComponent(Rect);

const VIEWBOX_SIZE = 256;
const SHEEN_WIDTH = 30;
const SHEEN_HEIGHT = 360;
const SHEEN_RADIUS = 15;
const SHEEN_START_X = -120;
const SHEEN_END_X = 220;
const SHEEN_START_Y = 220;
const SHEEN_END_Y = -120;
const SWEEP_DURATION_MS = 1500;
const SWEEP_IDLE_MS = 240;

export function GeminiLogo({ animated = true, size }: GeminiLogoProps) {
  const sheenPhase = useSharedValue(0);

  const animatedSheenProps = useAnimatedProps<SvgRectProps>(() => ({
    x: interpolate(sheenPhase.value, [0, 1], [SHEEN_START_X, SHEEN_END_X]),
    y: interpolate(sheenPhase.value, [0, 1], [SHEEN_START_Y, SHEEN_END_Y]),
  }));

  const animatedSheenCoreProps = useAnimatedProps<SvgRectProps>(() => ({
    x: interpolate(sheenPhase.value, [0, 1], [SHEEN_START_X + 9, SHEEN_END_X + 9]),
    y: interpolate(sheenPhase.value, [0, 1], [SHEEN_START_Y - 4, SHEEN_END_Y - 4]),
  }));

  useEffect(() => {
    if (!animated) {
      cancelAnimation(sheenPhase);
      sheenPhase.value = 0;
      return;
    }

    sheenPhase.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: SWEEP_DURATION_MS,
          easing: Easing.inOut(Easing.cubic),
        }),
        withDelay(
          SWEEP_IDLE_MS,
          withTiming(0, {
            duration: 0,
          })
        )
      ),
      -1,
      false
    );

    return () => {
      cancelAnimation(sheenPhase);
    };
  }, [animated, sheenPhase]);

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}>
      <Defs>
        <Mask
          id="geminiLogoMask"
          x="0"
          y="0"
          width={VIEWBOX_SIZE}
          height={VIEWBOX_SIZE}
          maskUnits="userSpaceOnUse"
          maskContentUnits="userSpaceOnUse"
        >
          <SvgImage
            href={brandAssets.logo}
            x="0"
            y="0"
            width={VIEWBOX_SIZE}
            height={VIEWBOX_SIZE}
            preserveAspectRatio="xMidYMid meet"
          />
        </Mask>
      </Defs>

      <SvgImage
        href={brandAssets.logo}
        x="0"
        y="0"
        width={VIEWBOX_SIZE}
        height={VIEWBOX_SIZE}
        preserveAspectRatio="xMidYMid meet"
      />

      <AnimatedRect
        animatedProps={animatedSheenProps}
        width={SHEEN_WIDTH}
        height={SHEEN_HEIGHT}
        rx={SHEEN_RADIUS}
        fill="rgba(255, 255, 255, 0.42)"
        mask="url(#geminiLogoMask)"
        transform="rotate(-34 128 128)"
      />
      <AnimatedRect
        animatedProps={animatedSheenCoreProps}
        width={10}
        height={SHEEN_HEIGHT}
        rx={5}
        fill="rgba(255, 255, 255, 0.72)"
        mask="url(#geminiLogoMask)"
        transform="rotate(-34 128 128)"
      />
    </Svg>
  );
}
