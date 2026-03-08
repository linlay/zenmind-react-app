import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { THEMES } from '../../../../core/constants/theme';
import { useAppSelector } from '../../../store/hooks';
import {
  TAB_CARD_BASE_STYLE,
  TAB_ICON_TILE_RADIUS,
  TAB_ICON_TILE_SIZE,
  TAB_LIST_CONTENT_STYLE,
  TAB_META_FONT_SIZE,
  TAB_TITLE_LARGE_FONT_SIZE,
  getTabPagePalette
} from '../../styles/tabPageVisual';

type DriveItemType = 'folder' | 'archive';

interface DriveItem {
  id: string;
  name: string;
  date: string;
  size: string;
  type: DriveItemType;
}

interface DriveContentProps {
  testIDPrefix?: string;
}

const DRIVE_ITEMS: DriveItem[] = [
  {
    id: 'documents',
    name: 'Documents',
    date: '2023-10-01',
    size: '--',
    type: 'folder'
  },
  {
    id: 'images',
    name: 'Images',
    date: '2023-10-02',
    size: '--',
    type: 'folder'
  },
  {
    id: 'backup',
    name: 'Backup.zip',
    date: '2023-12-05',
    size: '120 MB',
    type: 'archive'
  }
];

function FolderIcon({ color }: { color: string }) {
  return (
    <Svg width={25} height={25} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3.7 8.8C3.7 7.53 4.73 6.5 6 6.5H9.3L10.9 8.1H17.6C18.87 8.1 19.9 9.13 19.9 10.4V16.5C19.9 17.77 18.87 18.8 17.6 18.8H6C4.73 18.8 3.7 17.77 3.7 16.5V8.8Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ArchiveIcon({ color }: { color: string }) {
  return (
    <Svg width={25} height={25} viewBox="0 0 24 24" fill="none">
      <Rect x={5.1} y={7.6} width={13.8} height={10.9} rx={1.9} stroke={color} strokeWidth={1.8} />
      <Rect x={4.1} y={4.7} width={15.8} height={3.8} rx={1.3} stroke={color} strokeWidth={1.8} />
      <Path d="M12 10.5V14.6" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M10.2 14.6H13.8" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function MoreIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Circle cx={10} cy={4.5} r={1.35} fill={color} />
      <Circle cx={10} cy={10} r={1.35} fill={color} />
      <Circle cx={10} cy={15.5} r={1.35} fill={color} />
    </Svg>
  );
}

function UploadIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 15.7V5.9M12 5.9L8.4 9.5M12 5.9L15.6 9.5"
        stroke="#fff"
        strokeWidth={2.15}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M6.2 16.1V18.4C6.2 19.39 7.01 20.2 8 20.2H16C16.99 20.2 17.8 19.39 17.8 18.4V16.1"
        stroke="#fff"
        strokeWidth={2.15}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function buildTestID(prefix: string | undefined, suffix: string) {
  return prefix ? `${prefix}-${suffix}` : undefined;
}

export function DriveContent({ testIDPrefix = 'drive' }: DriveContentProps) {
  const themeMode = useAppSelector((state) => state.user.themeMode);
  const theme = useMemo(() => THEMES[themeMode] || THEMES.light, [themeMode]);
  const sharedPalette = useMemo(() => getTabPagePalette(theme), [theme]);

  const palette = useMemo(
    () => ({
      pageBg: sharedPalette.pageBackground,
      cardBg: sharedPalette.cardBackground,
      cardBorder: sharedPalette.cardBorder,
      iconTileBg: sharedPalette.iconTileBackground,
      folderColor: theme.mode === 'dark' ? '#76a5ff' : '#4379df',
      archiveColor: theme.mode === 'dark' ? '#ffab5c' : '#f07a20',
      fabColor: theme.primary
    }),
    [sharedPalette, theme]
  );

  return (
    <View style={[styles.page, { backgroundColor: palette.pageBg }]} testID={buildTestID(testIDPrefix, 'page')}>
      <ScrollView style={styles.listWrap} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {DRIVE_ITEMS.map((item, index) => {
          const iconColor = item.type === 'archive' ? palette.archiveColor : palette.folderColor;

          return (
            <View
              key={item.id}
              style={[
                styles.itemCard,
                {
                  backgroundColor: palette.cardBg,
                  borderColor: palette.cardBorder
                }
              ]}
              testID={buildTestID(testIDPrefix, `item-${index}`)}
            >
              <View style={[styles.itemIconWrap, { backgroundColor: palette.iconTileBg }]}>
                {item.type === 'archive' ? <ArchiveIcon color={iconColor} /> : <FolderIcon color={iconColor} />}
              </View>
              <View style={styles.itemContent}>
                <Text style={[styles.itemName, { color: theme.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.itemMeta, { color: theme.textMute }]} numberOfLines={1}>
                  {`${item.date}  •  ${item.size}`}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.74}
                style={styles.itemMoreWrap}
                testID={buildTestID(testIDPrefix, `item-more-${index}`)}
                onPress={() => {}}
              >
                <MoreIcon color={theme.textMute} />
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>

      <TouchableOpacity
        activeOpacity={0.84}
        style={[styles.uploadFab, { backgroundColor: palette.fabColor }]}
        testID={buildTestID(testIDPrefix, 'upload-btn')}
        onPress={() => {}}
      >
        <UploadIcon />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1
  },
  listWrap: {
    flex: 1
  },
  listContent: {
    ...TAB_LIST_CONTENT_STYLE,
    paddingBottom: 104,
    gap: 10
  },
  itemCard: {
    ...TAB_CARD_BASE_STYLE,
    minHeight: 90,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  itemIconWrap: {
    width: TAB_ICON_TILE_SIZE,
    height: TAB_ICON_TILE_SIZE,
    borderRadius: TAB_ICON_TILE_RADIUS,
    alignItems: 'center',
    justifyContent: 'center'
  },
  itemContent: {
    flex: 1,
    minWidth: 0,
    paddingLeft: 12,
    paddingRight: 8
  },
  itemName: {
    fontSize: TAB_TITLE_LARGE_FONT_SIZE,
    fontWeight: '700'
  },
  itemMeta: {
    marginTop: 5,
    fontSize: TAB_META_FONT_SIZE,
    fontWeight: '600'
  },
  itemMoreWrap: {
    width: 28,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center'
  },
  uploadFab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#204fb7',
    shadowOffset: {
      width: 0,
      height: 4
    },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4
  }
});
