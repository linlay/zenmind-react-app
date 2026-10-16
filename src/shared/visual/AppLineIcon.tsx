import { memo } from 'react';
import { Path, Svg } from 'react-native-svg';

import {
  APP_LINE_ICON_OUTLINE_PATHS,
  APP_LINE_ICON_PATHS,
  OUTLINE_ICON_VIEW_BOX,
  type AppLineIconName,
  type AppLineIconOutlineName,
  type AppLineIconPathName
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
  return name in APP_LINE_ICON_OUTLINE_PATHS;
}

export const AppLineIcon = memo(function AppLineIcon({ name, color, size = 24, strokeWidth = 1.8 }: AppLineIconProps) {
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
        {APP_LINE_ICON_OUTLINE_PATHS[name].map((path, index) => (
          <Path
            key={index}
            d={path}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </Svg>
    );
  }

  return null;
});
