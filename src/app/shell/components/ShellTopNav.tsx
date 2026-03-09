import { ReactNode } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { AppTheme } from '../../../core/constants/theme';
import { ShellHeaderDescriptor } from '../header/types';
import { styles } from '../ShellScreen.styles';

interface ShellTopNavProps {
  descriptor: ShellHeaderDescriptor;
}

interface ThemedProps {
  theme: AppTheme;
}

interface ShellHeaderButtonProps extends ThemedProps {
  children?: ReactNode;
  onPress?: () => void;
  testID?: string;
}

interface ShellHeaderTitleProps extends ThemedProps {
  title: string;
  subtitle?: string;
  titleWrapTestID?: string;
  subtitleTestID?: string;
}

interface ShellHeaderSearchInputProps extends ThemedProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  testID?: string;
}

interface ShellHeaderActionButtonProps extends ThemedProps {
  label: string;
  onPress?: () => void;
  testID?: string;
}

export function ShellTopNav({ descriptor }: ShellTopNavProps) {
  const sideMode = descriptor.sideMode === 'wide' ? styles.topNavSideWide : null;

  return (
    <View style={styles.topNavCompact} nativeID="shell-top-nav" testID="shell-top-nav">
      <View style={[styles.topNavSide, sideMode]} testID="shell-top-left-slot">
        {descriptor.left || <View style={styles.iconOnlyBtn} />}
      </View>
      <View style={styles.topNavCenter} testID="shell-top-center-slot">
        {descriptor.center || null}
      </View>
      <View style={[styles.topNavSide, styles.topNavRightSide, sideMode]} testID="shell-top-right-slot">
        {descriptor.right || <View style={styles.iconOnlyBtn} />}
      </View>
    </View>
  );
}

export function ShellHeaderIconButton({ theme, children, onPress, testID }: ShellHeaderButtonProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.72}
      style={[styles.iconOnlyBtn, { backgroundColor: theme.surfaceStrong }]}
      testID={testID}
      onPress={onPress}
    >
      {children}
    </TouchableOpacity>
  );
}

export function ShellHeaderBackButton({ theme, children, onPress, testID }: ShellHeaderButtonProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.72}
      style={[styles.detailBackBtn, { backgroundColor: theme.surfaceStrong }]}
      testID={testID}
      onPress={onPress}
    >
      {children || <Text style={[styles.detailBackText, { color: theme.primaryDeep }]}>‹</Text>}
    </TouchableOpacity>
  );
}

export function ShellHeaderActionButton({ theme, label, onPress, testID }: ShellHeaderActionButtonProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.72}
      style={[styles.topActionBtn, { backgroundColor: theme.surfaceStrong }]}
      testID={testID}
      onPress={onPress}
    >
      <Text style={[styles.topActionText, { color: theme.primaryDeep }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function ShellHeaderPlaceholder({ testID }: { testID?: string }) {
  return <View style={styles.iconOnlyBtn} testID={testID} />;
}

export function ShellHeaderTitle({
  theme,
  title,
  subtitle,
  titleWrapTestID = 'shell-top-title-wrap',
  subtitleTestID = 'shell-top-subtitle'
}: ShellHeaderTitleProps) {
  return (
    <View style={[styles.assistantTopBtn, { backgroundColor: theme.surfaceStrong }]}>
      <View style={styles.assistantTopTextWrap} testID={titleWrapTestID}>
        <Text style={[styles.assistantTopTitle, { color: theme.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[styles.assistantTopSubTitle, { color: theme.textMute }]}
            numberOfLines={1}
            testID={subtitleTestID}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function ShellHeaderSearchInput({ theme, value, onChangeText, placeholder, testID }: ShellHeaderSearchInputProps) {
  return (
    <View style={[styles.topSearchWrap, { backgroundColor: theme.surfaceStrong, borderColor: theme.border }]}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textMute}
        autoFocus
        autoCorrect={false}
        autoCapitalize="none"
        style={[styles.topSearchInput, { color: theme.text }]}
        testID={testID}
      />
    </View>
  );
}

export function ShellHeaderActionRow({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <View style={styles.chatListTopActions} testID={testID}>
      {children}
    </View>
  );
}

export function ShellHeaderMenuPopover({ children }: { children: ReactNode }) {
  return <View style={styles.chatPlusWrap}>{children}</View>;
}

export function ShellHeaderMenuPanel({
  theme,
  children,
  testID
}: ThemedProps & { children: ReactNode; testID?: string }) {
  return (
    <View style={[styles.chatPlusMenu, { backgroundColor: theme.surfaceStrong, borderColor: theme.border }]} testID={testID}>
      {children}
    </View>
  );
}

export function ShellHeaderMenuItem({
  theme,
  children,
  index,
  onPress,
  testID
}: ThemedProps & {
  children: ReactNode;
  index: number;
  onPress?: () => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.74}
      style={[
        styles.chatPlusMenuItem,
        index > 0 ? { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth } : null
      ]}
      testID={testID}
      onPress={onPress}
    >
      <Text style={[styles.chatPlusMenuItemText, { color: theme.text }]}>{children}</Text>
    </TouchableOpacity>
  );
}

export function ShellHeaderInboxButton({
  theme,
  badgeCount,
  onPress,
  testID
}: ThemedProps & {
  badgeCount: number;
  onPress?: () => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.72}
      style={[styles.iconOnlyBtn, { backgroundColor: theme.surfaceStrong }]}
      testID={testID}
      onPress={onPress}
    >
      <ShellInboxIcon color={theme.primaryDeep} />
      {badgeCount > 0 ? (
        <View style={[styles.inboxBadge, { backgroundColor: theme.danger }]}>
          <Text style={styles.inboxBadgeText}>{badgeCount > 99 ? '99+' : String(badgeCount)}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

export function ShellHeaderThemeButton({ theme, onPress, testID }: ThemedProps & { onPress?: () => void; testID?: string }) {
  return (
    <TouchableOpacity
      activeOpacity={0.72}
      style={[styles.iconOnlyBtn, { backgroundColor: theme.surfaceStrong }]}
      testID={testID}
      onPress={onPress}
    >
      <Text style={[styles.themeToggleText, { color: theme.primaryDeep }]}>◐</Text>
    </TouchableOpacity>
  );
}

export function ShellChatSidebarIcon({ theme }: ThemedProps) {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Rect x={2} y={5.6} width={16} height={2.2} rx={1.1} fill={theme.primaryDeep} />
      <Rect x={2} y={12.2} width={10} height={2.2} rx={1.1} fill={theme.primaryDeep} />
    </Svg>
  );
}

export function ShellMenuIcon({ theme }: ThemedProps) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={5.2} width={18} height={2.3} rx={1.15} fill={theme.primaryDeep} />
      <Rect x={3} y={10.85} width={18} height={2.3} rx={1.15} fill={theme.primaryDeep} />
      <Rect x={3} y={16.5} width={18} height={2.3} rx={1.15} fill={theme.primaryDeep} />
    </Svg>
  );
}

export function ShellSearchIcon({ theme }: ThemedProps) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M16.2 16.2L20 20M18 11a7 7 0 1 1-14 0a7 7 0 0 1 14 0Z"
        stroke={theme.primaryDeep}
        strokeWidth={2.1}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function ShellPlusIcon({ theme }: ThemedProps) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke={theme.primaryDeep} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

export function ShellKebabIcon({ theme }: ThemedProps) {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Rect x={2} y={4.8} width={16} height={2.2} rx={1.1} fill={theme.primaryDeep} />
      <Rect x={2} y={8.9} width={16} height={2.2} rx={1.1} fill={theme.primaryDeep} />
      <Rect x={2} y={13} width={16} height={2.2} rx={1.1} fill={theme.primaryDeep} />
    </Svg>
  );
}

export function ShellSelectIcon({ theme }: ThemedProps) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={4} width={16} height={16} rx={2.8} stroke={theme.primaryDeep} strokeWidth={1.9} />
      <Path
        d="M8.6 12.5L11 14.9L16.3 9.7"
        stroke={theme.primaryDeep}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ShellInboxIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Rect x={3.2} y={5} width={17.6} height={14} rx={3} stroke={color} strokeWidth={1.9} />
      <Path d="M4.8 8.4L12 13.2L19.2 8.4" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
