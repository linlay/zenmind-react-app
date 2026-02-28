import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { AppTheme } from '../../core/constants/theme';
import { DomainMode } from '../../core/types/common';

interface BottomDomainNavProps {
  value: DomainMode;
  theme: AppTheme;
  onPressItem: (mode: DomainMode) => void;
}

const ITEMS: Array<{ key: DomainMode; label: string }> = [
  { key: 'chat', label: '对话' },
  { key: 'terminal', label: '终端' },
  { key: 'agents', label: '智能体' },
  { key: 'user', label: '配置' }
];

const ICON_SIZE = 29;

function DomainIcon({ mode, color }: { mode: DomainMode; color: string }) {
  if (mode === 'chat') {
    return (
      <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
        <Path
          d="M12 5.8c4.7 0 8.4 2.8 8.4 6.3s-3.7 6.3-8.4 6.3c-1.2 0-2.3-.2-3.3-.6L5.4 19.6l1.4-3c-1.4-1.1-2.2-2.7-2.2-4.5c0-3.5 3.7-6.3 8.4-6.3Z"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }

  if (mode === 'terminal') {
    return (
      <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
        <Rect x={3.5} y={5} width={17} height={14} rx={2.4} stroke={color} strokeWidth={1.8} />
        <Path
          d="M8 10l2.8 2.4L8 14.8M13.2 15h3.4"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }

  if (mode === 'agents') {
    return (
      <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
        <Rect x={4.5} y={7} width={15} height={11} rx={2.2} stroke={color} strokeWidth={1.8} />
        <Path
          d="M9 4.8h6M12 7V4.8M9.2 11.4h.01M14.8 11.4h.01"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
        />
      </Svg>
    );
  }

  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4.8 8.2H19.2M4.8 12H19.2M4.8 15.8H19.2"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <Circle cx={9} cy={8.2} r={1.8} fill={color} />
      <Circle cx={14.8} cy={12} r={1.8} fill={color} />
      <Circle cx={7.2} cy={15.8} r={1.8} fill={color} />
    </Svg>
  );
}

export function BottomDomainNav({ value, theme, onPressItem }: BottomDomainNavProps) {
  return (
    <View style={[styles.wrap, { borderTopColor: theme.border, backgroundColor: theme.surface }]}>
      {ITEMS.map((item) => {
        const active = item.key === value;
        const iconColor = active ? theme.primaryDeep : theme.textMute;
        return (
          <TouchableOpacity
            key={item.key}
            activeOpacity={0.78}
            style={styles.item}
            onPress={() => onPressItem(item.key)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            testID={`bottom-nav-tab-${item.key}`}
          >
            <View style={styles.itemInner} testID={`bottom-nav-tab-content-${item.key}`}>
              <View style={styles.iconWrap} testID={`bottom-nav-tab-icon-wrap-${item.key}`}>
                <DomainIcon mode={item.key} color={iconColor} />
              </View>
              <Text style={[styles.label, { color: active ? theme.primaryDeep : theme.textMute }]}>{item.label}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingTop: 4,
    paddingBottom: 5,
    paddingHorizontal: 8
  },
  item: {
    flex: 1,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center'
  },
  itemInner: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    minHeight: 42
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center'
  },
  label: {
    fontSize: 11,
    fontWeight: '600'
  }
});
