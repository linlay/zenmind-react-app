import { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { THEMES } from '../../../../core/constants/theme';
import { useAppSelector } from '../../../store/hooks';

import { TerminalRouteBridgeProps, TerminalRouteScreenProps } from './types';

type DriveItemType = 'folder' | 'video';

interface DriveItem {
  id: string;
  name: string;
  date: string;
  size: string;
  type: DriveItemType;
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
    id: 'project-demo',
    name: 'Project_Demo.mp4',
    date: '2023-12-01',
    size: '450 MB',
    type: 'video'
  }
];

function FolderIcon({ color }: { color: string }) {
  return (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3.5 8.4C3.5 7.35 4.35 6.5 5.4 6.5H9.25L10.9 8.2H18.6C19.65 8.2 20.5 9.05 20.5 10.1V17.6C20.5 18.65 19.65 19.5 18.6 19.5H5.4C4.35 19.5 3.5 18.65 3.5 17.6V8.4Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function VideoIcon({ color }: { color: string }) {
  return (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={7} width={11} height={10} rx={2} stroke={color} strokeWidth={1.8} />
      <Path
        d="M15.2 10.3L19.2 8.2C19.93 7.82 20.8 8.35 20.8 9.18V14.82C20.8 15.65 19.93 16.18 19.2 15.8L15.2 13.7V10.3Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function MoreIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Circle cx={10} cy={4.5} r={1.4} fill={color} />
      <Circle cx={10} cy={10} r={1.4} fill={color} />
      <Circle cx={10} cy={15.5} r={1.4} fill={color} />
    </Svg>
  );
}

export function TerminalDriveRouteScreen({
  navigation,
  onBindNavigation,
  onRouteFocus
}: TerminalRouteScreenProps<'TerminalDrive'> & TerminalRouteBridgeProps) {
  const themeMode = useAppSelector((state) => state.user.themeMode);
  const theme = useMemo(() => THEMES[themeMode] || THEMES.light, [themeMode]);

  useEffect(() => {
    onBindNavigation?.(navigation);
  }, [navigation, onBindNavigation]);

  useEffect(() => {
    const notifyFocus = () => {
      onRouteFocus?.('TerminalDrive');
    };

    notifyFocus();
    const unsubscribe = navigation.addListener('focus', notifyFocus);
    return unsubscribe;
  }, [navigation, onRouteFocus]);

  return (
    <View style={[styles.page, { backgroundColor: theme.surface }]} testID="terminal-drive-page">
      <ScrollView contentContainerStyle={styles.listContent} style={styles.listWrap}>
        {DRIVE_ITEMS.map((item, index) => {
          const iconColor = item.type === 'video' ? '#ef4444' : theme.primaryDeep;
          return (
            <View
              key={item.id}
              style={[styles.itemCard, { backgroundColor: theme.surfaceStrong, borderColor: theme.border }]}
              testID={`terminal-drive-item-${index}`}
            >
              <View style={[styles.itemIconWrap, { backgroundColor: theme.surface }]}>
                {item.type === 'video' ? <VideoIcon color={iconColor} /> : <FolderIcon color={iconColor} />}
              </View>
              <View style={styles.itemContent}>
                <Text style={[styles.itemName, { color: theme.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.itemMeta, { color: theme.textMute }]}>{`${item.date}  •  ${item.size}`}</Text>
              </View>
              <View style={styles.itemMoreWrap}>
                <MoreIcon color={theme.textMute} />
              </View>
            </View>
          );
        })}
      </ScrollView>

      <TouchableOpacity
        activeOpacity={0.8}
        style={[styles.uploadFab, { backgroundColor: theme.primaryDeep }]}
        testID="terminal-drive-upload-btn"
        onPress={() => {}}
      >
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
          <Path
            d="M12 16V6M12 6L8.4 9.6M12 6L15.6 9.6"
            stroke="#fff"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M5.4 16.2V18.3C5.4 19.24 6.16 20 7.1 20H16.9C17.84 20 18.6 19.24 18.6 18.3V16.2"
            stroke="#fff"
            strokeWidth={2}
            strokeLinecap="round"
          />
        </Svg>
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
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 120,
    gap: 12
  },
  itemCard: {
    minHeight: 90,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  itemIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  itemContent: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 12
  },
  itemName: {
    fontSize: 17,
    fontWeight: '700'
  },
  itemMeta: {
    marginTop: 5,
    fontSize: 12,
    fontWeight: '500'
  },
  itemMoreWrap: {
    width: 26,
    alignItems: 'center'
  },
  uploadFab: {
    position: 'absolute',
    right: 20,
    bottom: 26,
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center'
  }
});
