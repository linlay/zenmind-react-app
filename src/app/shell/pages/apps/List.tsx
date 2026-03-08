import { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { THEMES } from '../../../../core/constants/theme';
import { useAppSelector } from '../../../store/hooks';
import {
  TAB_CARD_BASE_STYLE,
  TAB_ICON_TILE_RADIUS,
  TAB_ICON_TILE_SIZE,
  TAB_LIST_CONTENT_STYLE,
  TAB_SECONDARY_FONT_SIZE,
  TAB_TITLE_FONT_SIZE,
  getTabPagePalette
} from '../../styles/tabPageVisual';
import { APPS } from './config';
import { AppsRouteBridgeProps, AppsRouteScreenProps } from './types';

function AppCardIcon({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={4} width={16} height={16} rx={4} stroke={color} strokeWidth={1.8} />
      <Path d="M8 9.5H16M8 14.5H13" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

export function AppsListRouteScreen({
  navigation,
  onBindNavigation,
  onRouteFocus
}: AppsRouteScreenProps<'AppsList'> & AppsRouteBridgeProps) {
  const themeMode = useAppSelector((state) => state.user.themeMode);
  const theme = useMemo(() => THEMES[themeMode] || THEMES.light, [themeMode]);
  const palette = useMemo(() => getTabPagePalette(theme), [theme]);

  useEffect(() => {
    onBindNavigation?.(navigation);
  }, [navigation, onBindNavigation]);

  useEffect(() => {
    const notifyFocus = () => {
      onRouteFocus?.('AppsList');
    };

    notifyFocus();
    const unsubscribe = navigation.addListener('focus', notifyFocus);
    return unsubscribe;
  }, [navigation, onRouteFocus]);

  return (
    <View style={[styles.page, { backgroundColor: palette.pageBackground }]} testID="apps-list-page">
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {APPS.map((app, index) => (
          <TouchableOpacity
            key={app.key}
            activeOpacity={0.8}
            style={[styles.card, { backgroundColor: palette.cardBackground, borderColor: palette.cardBorder }]}
            testID={`apps-list-card-${index}`}
            onPress={() => navigation.navigate('AppsWebView', { appKey: app.key })}
          >
            <View style={[styles.iconWrap, { backgroundColor: palette.iconTileBackground }]}>
              <AppCardIcon color={theme.primaryDeep} />
            </View>
            <View style={styles.cardContent}>
              <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
                {app.name}
              </Text>
              {app.description ? (
                <Text style={[styles.cardDescription, { color: theme.textMute }]} numberOfLines={2}>
                  {app.description}
                </Text>
              ) : null}
              <View style={styles.cardMetaRow}>
                <View style={[styles.statusChip, { backgroundColor: theme.primarySoft }]}>
                  <Text style={[styles.statusText, { color: theme.primaryDeep }]}>{app.status}</Text>
                </View>
                <Text style={[styles.cardArrow, { color: theme.textMute }]}>›</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1
  },
  scroll: {
    flex: 1
  },
  content: {
    ...TAB_LIST_CONTENT_STYLE,
    gap: 10
  },
  card: {
    ...TAB_CARD_BASE_STYLE,
    minHeight: 89,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  iconWrap: {
    width: TAB_ICON_TILE_SIZE,
    height: TAB_ICON_TILE_SIZE,
    borderRadius: TAB_ICON_TILE_RADIUS,
    alignItems: 'center',
    justifyContent: 'center'
  },
  cardContent: {
    flex: 1,
    minWidth: 0,
    paddingLeft: 12
  },
  cardTitle: {
    fontSize: TAB_TITLE_FONT_SIZE,
    fontWeight: '700'
  },
  cardDescription: {
    marginTop: 6,
    fontSize: TAB_SECONDARY_FONT_SIZE,
    lineHeight: 18
  },
  cardMetaRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600'
  },
  cardArrow: {
    fontSize: 18,
    fontWeight: '500'
  }
});
