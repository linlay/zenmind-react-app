import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useAppTheme } from '../../../shared/visual/AppThemeProvider';

export function ChatSignedOutIllustration() {
  const { theme } = useAppTheme();
  return (
    <Svg width={180} height={128} viewBox="0 0 180 128" accessibilityElementsHidden>
      <Circle cx={90} cy={64} r={58} fill={theme.colors.surfaceMuted} />
      <Path
        d="M28 28h88a14 14 0 0 1 14 14v35a14 14 0 0 1-14 14H61L39 107V91H28a14 14 0 0 1-14-14V42a14 14 0 0 1 14-14Z"
        fill={theme.colors.brandBlueSoft}
      />
      <Rect x={38} y={48} width={65} height={5} rx={2.5} fill={theme.colors.brandBlue} />
      <Rect x={38} y={63} width={43} height={5} rx={2.5} fill={theme.colors.brandBlue} />
      <Path
        d="M121 71h32a10 10 0 0 1 10 10v14a10 10 0 0 1-10 10h-8v10l-14-10h-10a10 10 0 0 1-10-10V81a10 10 0 0 1 10-10Z"
        fill={theme.colors.brandBlue}
      />
      <Circle cx={126} cy={88} r={2.5} fill={theme.colors.onBrandBlueAction} />
      <Circle cx={137} cy={88} r={2.5} fill={theme.colors.onBrandBlueAction} />
      <Circle cx={148} cy={88} r={2.5} fill={theme.colors.onBrandBlueAction} />
    </Svg>
  );
}
