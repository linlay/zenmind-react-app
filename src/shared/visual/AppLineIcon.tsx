import { memo } from 'react';
import { Path, Rect, Svg } from 'react-native-svg';

import {
  APP_LINE_ICON_OUTLINE_NAMES,
  APP_LINE_ICON_PATHS,
  OUTLINE_ICON_VIEW_BOX,
  type AppLineIconName,
  type AppLineIconOutlineName,
  type AppLineIconPathName,
} from './appLineIconRegistry';

export type { AppLineIconName } from './appLineIconRegistry';

export type AppLineIconProps = {
  name: AppLineIconName;
  color: string;
  size?: number;
  strokeWidth?: number;
};

function isPathIconName(name: AppLineIconName): name is AppLineIconPathName {
  return name in APP_LINE_ICON_PATHS;
}

function isOutlineIconName(name: AppLineIconName): name is AppLineIconOutlineName {
  return name in APP_LINE_ICON_OUTLINE_NAMES;
}

const renderOutlineIcon = (name: AppLineIconOutlineName, color: string, strokeWidth: number) => {
  const strokeProps = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  if (name === 'spark') {
    return (
      <Path
        d="M12 4.7 13.7 9l4.3 1.7-4.3 1.7-1.7 4.3-1.7-4.3L6 10.7 10.3 9 12 4.7Z"
        {...strokeProps}
      />
    );
  }

  if (name === 'moon') {
    return <Path d="M17.8 15.4A7.4 7.4 0 0 1 8.6 6.2 7.4 7.4 0 1 0 17.8 15.4Z" {...strokeProps} />;
  }

  if (name === 'warning') {
    return (
      <>
        <Path d="M12 3.8 21 19.2H3L12 3.8Z" {...strokeProps} />
        <Path d="M12 9.2v4.2" {...strokeProps} />
        <Path d="M12 16.6h.01" {...strokeProps} />
      </>
    );
  }

  if (name === 'content_copy') {
    return (
      <>
        <Rect x={9} y={9} width={13} height={13} rx={2} ry={2} {...strokeProps} />
        <Path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" {...strokeProps} />
      </>
    );
  }

  return null;
};

export const AppLineIcon = memo(function AppLineIcon({
  name,
  color,
  size = 24,
  strokeWidth = 1.9,
}: AppLineIconProps) {
  if (isPathIconName(name)) {
    const icon = APP_LINE_ICON_PATHS[name];
    return (
      <Svg width={size} height={size} viewBox={icon.viewBox} fill="none">
        <Path d={icon.path} fill={color} />
      </Svg>
    );
  }

  if (isOutlineIconName(name)) {
    return (
      <Svg width={size} height={size} viewBox={OUTLINE_ICON_VIEW_BOX} fill="none">
        {renderOutlineIcon(name, color, strokeWidth)}
      </Svg>
    );
  }

  return null;
});
