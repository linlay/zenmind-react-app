import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { AppTheme } from '../../../core/constants/theme';
import { ChatRoute } from '../shellSlice';
import { ShellRouteModel } from '../routes/shellRouteModel';
import { styles } from '../ShellScreen.styles';

interface ShellTopNavProps {
  theme: AppTheme;
  routeModel: ShellRouteModel;
  chatRoute: ChatRoute;
  chatSearchQuery: string;
  hasChatOverlay: boolean;
  terminalPane: 'list' | 'detail';
  chatPlusMenuOpen: boolean;
  inboxUnreadCount: number;
  onChangeChatSearchQuery: (value: string) => void;
  onPressChatOverlayBack: () => void;
  onPressChatSearchBack: () => void;
  onPressChatLeftAction: () => void;
  onPressTerminalBack: () => void;
  onPressTerminalLeftAction: () => void;
  onPressUserInboxToggle: () => void;
  onPressTerminalRefresh: () => void;
  onPressChatDetailMenu: () => void;
  onPressChatListSearch: () => void;
  onToggleChatPlusMenu: () => void;
  onPressChatPlusMenuItem: (label: string) => void;
  onPressPublishToggle: () => void;
  onPressThemeToggle: () => void;
}

export function ShellTopNav({
  theme,
  routeModel,
  chatRoute,
  chatSearchQuery,
  hasChatOverlay,
  terminalPane,
  chatPlusMenuOpen,
  inboxUnreadCount,
  onChangeChatSearchQuery,
  onPressChatOverlayBack,
  onPressChatSearchBack,
  onPressChatLeftAction,
  onPressTerminalBack,
  onPressTerminalLeftAction,
  onPressUserInboxToggle,
  onPressTerminalRefresh,
  onPressChatDetailMenu,
  onPressChatListSearch,
  onToggleChatPlusMenu,
  onPressChatPlusMenuItem,
  onPressPublishToggle,
  onPressThemeToggle
}: ShellTopNavProps) {
  const {
    isChatDomain,
    isTerminalDomain,
    isUserDomain,
    isAgentsDomain,
    isChatDetailOverlay,
    isChatAgentOverlay,
    isChatListTopNav,
    topNavTitle,
    topNavSubtitle
  } = routeModel;

  return (
    <View style={styles.topNavCompact} nativeID="shell-top-nav" testID="shell-top-nav">
      <View style={[styles.topNavSide, isChatListTopNav ? styles.topNavSideWide : null]} testID="shell-top-left-slot">
        {isChatDomain ? (
          hasChatOverlay ? (
            <TouchableOpacity
              activeOpacity={0.72}
              style={[styles.detailBackBtn, { backgroundColor: theme.surfaceStrong }]}
              testID={isChatDetailOverlay ? 'chat-detail-back-btn' : 'chat-agent-back-btn'}
              onPress={onPressChatOverlayBack}
            >
              <Text
                style={[styles.detailBackText, { color: theme.primaryDeep }]}
                testID={isChatDetailOverlay ? 'chat-detail-back-text' : 'chat-agent-back-text'}
              >
                ‹
              </Text>
            </TouchableOpacity>
          ) : chatRoute === 'search' ? (
            <TouchableOpacity
              activeOpacity={0.72}
              style={[styles.detailBackBtn, { backgroundColor: theme.surfaceStrong }]}
              testID="chat-search-back-btn"
              onPress={onPressChatSearchBack}
            >
              <Text style={[styles.detailBackText, { color: theme.primaryDeep }]}>‹</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              activeOpacity={0.72}
              style={[styles.iconOnlyBtn, { backgroundColor: theme.surfaceStrong }]}
              testID="chat-left-action-btn"
              onPress={onPressChatLeftAction}
            >
              <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
                <Rect x={2} y={5.6} width={16} height={2.2} rx={1.1} fill={theme.primaryDeep} />
                <Rect x={2} y={12.2} width={10} height={2.2} rx={1.1} fill={theme.primaryDeep} />
              </Svg>
            </TouchableOpacity>
          )
        ) : isTerminalDomain ? (
          terminalPane === 'detail' ? (
            <TouchableOpacity
              activeOpacity={0.72}
              style={[styles.detailBackBtn, { backgroundColor: theme.surfaceStrong }]}
              testID="terminal-detail-back-btn"
              onPress={onPressTerminalBack}
            >
              <Text style={[styles.detailBackText, { color: theme.primaryDeep }]}>‹</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              activeOpacity={0.72}
              style={[styles.iconOnlyBtn, { backgroundColor: theme.surfaceStrong }]}
              testID="terminal-left-action-btn"
              onPress={onPressTerminalLeftAction}
            >
              <Text style={[styles.topActionText, { color: theme.textMute }]}>·</Text>
            </TouchableOpacity>
          )
        ) : isUserDomain ? (
          <TouchableOpacity
            activeOpacity={0.72}
            style={[styles.iconOnlyBtn, { backgroundColor: theme.surfaceStrong }]}
            testID="shell-user-inbox-toggle-btn"
            onPress={onPressUserInboxToggle}
          >
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
              <Rect x={3.2} y={5} width={17.6} height={14} rx={3} stroke={theme.primaryDeep} strokeWidth={1.9} />
              <Path d="M4.8 8.4L12 13.2L19.2 8.4" stroke={theme.primaryDeep} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            {inboxUnreadCount > 0 ? (
              <View style={[styles.inboxBadge, { backgroundColor: theme.danger }]}>
                <Text style={styles.inboxBadgeText}>{inboxUnreadCount > 99 ? '99+' : String(inboxUnreadCount)}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        ) : (
          <View style={styles.iconOnlyBtn} />
        )}
      </View>

      <View style={styles.topNavCenter} testID="shell-top-center-slot">
        {isChatDomain && !hasChatOverlay && chatRoute === 'search' ? (
          <View style={[styles.topSearchWrap, { backgroundColor: theme.surfaceStrong, borderColor: theme.border }]}>
            <TextInput
              value={chatSearchQuery}
              onChangeText={onChangeChatSearchQuery}
              placeholder="搜索 chat / 智能体"
              placeholderTextColor={theme.textMute}
              autoFocus
              autoCorrect={false}
              autoCapitalize="none"
              style={[styles.topSearchInput, { color: theme.text }]}
              testID="chat-top-search-input"
            />
          </View>
        ) : (
          <View style={[styles.assistantTopBtn, { backgroundColor: theme.surfaceStrong }]}>
            <View style={styles.assistantTopTextWrap} testID="shell-top-title-wrap">
              <Text style={[styles.assistantTopTitle, { color: theme.text }]} numberOfLines={1}>
                {topNavTitle}
              </Text>
              {topNavSubtitle ? (
                <Text
                  style={[styles.assistantTopSubTitle, { color: theme.textMute }]}
                  numberOfLines={1}
                  testID="shell-top-subtitle"
                >
                  {topNavSubtitle}
                </Text>
              ) : null}
            </View>
          </View>
        )}
      </View>

      <View style={[styles.topNavSide, styles.topNavRightSide, isChatListTopNav ? styles.topNavSideWide : null]} testID="shell-top-right-slot">
        {isTerminalDomain ? (
          <TouchableOpacity
            activeOpacity={0.72}
            style={[styles.topActionBtn, { backgroundColor: theme.surfaceStrong }]}
            testID="shell-terminal-refresh-btn"
            onPress={onPressTerminalRefresh}
          >
            <Text style={[styles.topActionText, { color: theme.primaryDeep }]}>刷新</Text>
          </TouchableOpacity>
        ) : isChatDomain ? (
          isChatDetailOverlay ? (
            <TouchableOpacity
              activeOpacity={0.72}
              style={[styles.iconOnlyBtn, { backgroundColor: theme.surfaceStrong }]}
              testID="chat-detail-menu-btn"
              onPress={onPressChatDetailMenu}
            >
              <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
                <Rect x={2} y={4.8} width={16} height={2.2} rx={1.1} fill={theme.primaryDeep} />
                <Rect x={2} y={8.9} width={16} height={2.2} rx={1.1} fill={theme.primaryDeep} />
                <Rect x={2} y={13} width={16} height={2.2} rx={1.1} fill={theme.primaryDeep} />
              </Svg>
            </TouchableOpacity>
          ) : isChatAgentOverlay ? (
            <View style={styles.iconOnlyBtn} testID="chat-agent-right-placeholder" />
          ) : chatRoute === 'search' ? (
            <View style={styles.iconOnlyBtn} testID="chat-search-right-placeholder" />
          ) : (
            <View style={styles.chatListTopActions} testID="chat-list-top-actions">
              <TouchableOpacity
                activeOpacity={0.72}
                style={[styles.iconOnlyBtn, { backgroundColor: theme.surfaceStrong }]}
                testID="chat-list-search-btn"
                onPress={onPressChatListSearch}
              >
                <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                  <Path
                    d="M16.2 16.2L20 20M18 11a7 7 0 1 1-14 0a7 7 0 0 1 14 0Z"
                    stroke={theme.primaryDeep}
                    strokeWidth={2.3}
                    strokeLinecap="round"
                  />
                </Svg>
              </TouchableOpacity>

              <View style={styles.chatPlusWrap}>
                <TouchableOpacity
                  activeOpacity={0.72}
                  style={[styles.iconOnlyBtn, { backgroundColor: theme.surfaceStrong }]}
                  testID="chat-list-plus-btn"
                  onPress={onToggleChatPlusMenu}
                >
                  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                    <Path d="M12 5v14M5 12h14" stroke={theme.primaryDeep} strokeWidth={2.4} strokeLinecap="round" />
                  </Svg>
                </TouchableOpacity>

                {chatPlusMenuOpen ? (
                  <View style={[styles.chatPlusMenu, { backgroundColor: theme.surfaceStrong, borderColor: theme.border }]} testID="chat-list-plus-menu">
                    {['扫一扫', '建立群组', '创建频道'].map((label, index) => (
                      <TouchableOpacity
                        key={label}
                        activeOpacity={0.74}
                        style={[
                          styles.chatPlusMenuItem,
                          index > 0 ? { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth } : null
                        ]}
                        testID={`chat-list-plus-menu-item-${index}`}
                        onPress={() => onPressChatPlusMenuItem(label)}
                      >
                        <Text style={[styles.chatPlusMenuItemText, { color: theme.text }]}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </View>
            </View>
          )
        ) : isAgentsDomain ? (
          <TouchableOpacity
            activeOpacity={0.72}
            style={[styles.topActionBtn, { backgroundColor: theme.surfaceStrong }]}
            testID="shell-publish-toggle-btn"
            onPress={onPressPublishToggle}
          >
            <Text style={[styles.topActionText, { color: theme.primaryDeep }]}>发布</Text>
          </TouchableOpacity>
        ) : isUserDomain ? (
          <TouchableOpacity
            activeOpacity={0.72}
            style={[styles.iconOnlyBtn, { backgroundColor: theme.surfaceStrong }]}
            testID="shell-theme-toggle-btn"
            onPress={onPressThemeToggle}
          >
            <Text style={[styles.themeToggleText, { color: theme.primaryDeep }]}>◐</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.iconOnlyBtn} />
        )}
      </View>
    </View>
  );
}
