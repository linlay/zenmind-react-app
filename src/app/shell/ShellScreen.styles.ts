import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  safeRoot: {
    flex: 1
  },
  gradientFill: {
    flex: 1
  },
  shell: {
    flex: 1
  },
  bootWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  bootCard: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  authTitle: {
    fontSize: 18,
    fontWeight: '600'
  },
  bootText: {
    fontSize: 14
  },
  domainContent: {
    flex: 1
  },
  chatTopMenuMask: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 64,
    zIndex: 8
  },
  stackViewport: {
    flex: 1,
    overflow: 'hidden'
  },
  stackTrack: {
    flex: 1,
    flexDirection: 'row'
  },
  stackPage: {
    flex: 1
  },
  chatOverlayPage: {
    ...StyleSheet.absoluteFillObject
  },
  topNavCompact: {
    position: 'relative',
    zIndex: 6,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 14,
    // marginTop: 3,
    // marginBottom: 3,
    gap: 8
  },
  topNavSide: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'flex-start',
    justifyContent: 'center'
  },
  topNavRightSide: {
    alignItems: 'flex-end'
  },
  topNavSideWide: {
    width: 96
  },
  topNavCenter: {
    flex: 1,
    minWidth: 0
  },
  iconOnlyBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  detailBackBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  topActionBtn: {
    minWidth: 58,
    height: 38,
    borderRadius: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  topActionText: {
    fontSize: 13,
    fontWeight: '600'
  },
  chatListTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  chatPlusWrap: {
    position: 'relative'
  },
  chatPlusMenu: {
    position: 'absolute',
    right: 0,
    top: 46,
    width: 164,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    zIndex: 12
  },
  chatPlusMenuItem: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 14
  },
  chatPlusMenuItemText: {
    fontSize: 14,
    fontWeight: '600'
  },
  detailBackText: {
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 26
  },
  themeToggleText: {
    fontSize: 16,
    fontWeight: '600'
  },
  assistantTopBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    gap: 5
  },
  topSearchWrap: {
    flex: 1,
    minHeight: 40,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    paddingHorizontal: 10
  },
  topSearchInput: {
    height: 38,
    paddingHorizontal: 0,
    paddingVertical: 0,
    fontSize: 14
  },
  assistantTopTextWrap: {
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
    alignItems: 'center',
    maxWidth: '84%'
  },
  assistantTopTitle: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center'
  },
  assistantTopSubTitle: {
    marginTop: 0,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center'
  },
  publishLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 13
  },
  publishModal: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: StyleSheet.hairlineWidth
  },
  publishHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  publishTitleWrap: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10
  },
  publishTitle: {
    fontSize: 16,
    fontWeight: '600'
  },
  publishSubTitle: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 16
  },
  publishCloseBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  publishCloseText: {
    fontSize: 11,
    fontWeight: '600'
  },
  publishScroll: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 10
  },
  publishContent: {
    paddingBottom: 14,
    gap: 10
  },
  publishSection: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  publishSectionTitle: {
    fontSize: 13,
    fontWeight: '600'
  },
  publishSectionBody: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18
  },
  publishChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8
  },
  publishChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  publishChipText: {
    fontSize: 11,
    fontWeight: '600'
  },
  publishChecklist: {
    marginTop: 8,
    gap: 6
  },
  publishChecklistItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6
  },
  publishChecklistDot: {
    fontSize: 12,
    lineHeight: 16
  },
  publishChecklistText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18
  },
  publishFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    flexDirection: 'row',
    gap: 8
  },
  publishGhostBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center'
  },
  publishGhostText: {
    fontSize: 12,
    fontWeight: '600'
  },
  publishPrimaryBtn: {
    flex: 1.2,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center'
  },
  publishPrimaryText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600'
  },
  loginSubmitBtn: {
    minHeight: 44,
    borderWidth: 1
  },
  loginSubmitText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3
  },
  loginVersionTextBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    fontSize: 11,
    textAlign: 'center'
  },
  chatSearchInput: {
    borderRadius: 10,
    height: 38,
    paddingHorizontal: 12,
    paddingVertical: 0,
    fontSize: 13,
    lineHeight: 18,
    textAlignVertical: 'center',
    marginBottom: 10
  },
  emptyHistoryText: {
    fontSize: 12
  },
  bottomNavWrap: {
    borderTopWidth: 0
  }
});
