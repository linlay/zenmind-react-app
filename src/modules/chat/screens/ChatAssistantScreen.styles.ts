import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  contentPushLayer: {
    flex: 1
  },
  contentWrap: {
    flex: 1,
    zIndex: 1
  },
  timelineGestureLayer: {
    flex: 1
  },
  createChatHintBehind: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 52,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 0
  },
  createChatHintBehindCard: {
    alignItems: 'center',
    gap: 2
  },
  createChatHintBehindChar: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20
  },
  switchPrevHintBehind: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 0
  },
  switchNextHintBehind: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 0
  },
  switchHintCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 7
  },
  switchHintText: {
    fontSize: 12,
    fontWeight: '700'
  },
  switchHintArrow: {
    fontSize: 14,
    fontWeight: '700'
  },
  timelineList: {
    flex: 1
  },
  timelineContent: {
    paddingTop: 8,
    paddingBottom: 4
  },
  timelineContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center'
  },
  emptyPanel: {
    marginHorizontal: 14,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 20
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700'
  },
  emptySubTitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18
  },
  composerOuter: {
    paddingTop: 4
  },
  composerLayer: {
    position: 'relative'
  },
  frontendToolOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 6
  },
  frontendToolOverlayMask: {
    ...StyleSheet.absoluteFillObject
  },
  frontendToolOverlaySheetWrap: {
    paddingTop: 4
  },
  scrollToBottomAbovePlan: {
    position: 'absolute',
    left: '50%',
    marginLeft: -22,
    top: -54,
    zIndex: 4
  },
  scrollToBottomAboveComposer: {
    position: 'absolute',
    left: '50%',
    marginLeft: -22,
    top: -54,
    zIndex: 4
  },
  scrollToBottomBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3
  },
  scrollToBottomText: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: -2
  },
  planFloatWrap: {
    marginHorizontal: 14,
    marginBottom: -6,
    position: 'relative',
    zIndex: 3,
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2
  },
  planCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  planHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  planTitle: {
    fontWeight: '700',
    fontSize: 14
  },
  planHint: {
    fontSize: 10,
    fontWeight: '500'
  },
  planTaskList: {
    gap: 8
  },
  planTaskRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8
  },
  planTaskDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 4
  },
  planTaskText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18
  },
  planCollapsedWrap: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  planCollapsedText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600'
  },
  copyToast: {
    position: 'absolute',
    bottom: 120,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.76)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    zIndex: 3
  },
  copyToastText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600'
  },
  edgeToastWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 7
  },
  edgeToastCard: {
    maxWidth: '84%',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  edgeToastText: {
    fontSize: 12,
    fontWeight: '600'
  },
  fireworksLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3
  },
  fireworkRocket: {
    position: 'absolute',
    shadowOpacity: 0.42,
    shadowRadius: 8
  },
  fireworkSpark: {
    position: 'absolute',
    shadowOpacity: 0.3,
    shadowRadius: 6
  },
  actionModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20
  },
  actionModalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    padding: 16
  },
  actionModalTitle: {
    fontSize: 16,
    fontWeight: '700'
  },
  actionModalContent: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20
  },
  actionModalBtn: {
    marginTop: 14,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center'
  },
  actionModalBtnText: {
    fontSize: 14,
    fontWeight: '700'
  }
});
