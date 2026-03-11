import { StyleSheet } from 'react-native';

import {
  TAB_CARD_BASE_STYLE,
  TAB_ICON_TILE_RADIUS,
  TAB_ICON_TILE_SIZE,
  TAB_LIST_CONTENT_STYLE,
  TAB_META_FONT_SIZE,
  TAB_SECONDARY_FONT_SIZE,
  TAB_TITLE_FONT_SIZE,
} from '../../styles/tabPageVisual';
import { FONT_MONO } from '../../../../core/constants/theme';

const styles = StyleSheet.create({
  page: {
    flex: 1
  },
  listWrap: {
    flex: 1
  },
  listContent: {
    ...TAB_LIST_CONTENT_STYLE,
    gap: 10
  },
  mountStrip: {
    marginBottom: 4
  },
  mountStripContent: {
    gap: 8,
    paddingRight: 12
  },
  mountChip: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 9
  },
  mountChipText: {
    fontSize: 13,
    fontWeight: '700'
  },
  infoCard: {
    ...TAB_CARD_BASE_STYLE,
    paddingHorizontal: 14,
    paddingVertical: 14
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase'
  },
  infoTitle: {
    marginTop: 6,
    fontSize: 20,
    fontWeight: '800'
  },
  infoMeta: {
    marginTop: 5,
    fontSize: TAB_META_FONT_SIZE,
    fontWeight: '600'
  },
  browserPathCard: {
    paddingVertical: 12
  },
  browserPathHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  browserMountPill: {
    maxWidth: '68%',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  browserMountText: {
    fontSize: 12,
    fontWeight: '800'
  },
  browserBreadcrumbRow: {
    alignItems: 'center',
    gap: 8,
    paddingRight: 10
  },
  browserNavChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  browserNavChipText: {
    fontSize: 12,
    fontWeight: '800'
  },
  browserBreadcrumbChip: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  browserBreadcrumbText: {
    fontSize: 12,
    fontWeight: '700'
  },
  breadcrumbRow: {
    alignItems: 'center',
    gap: 6,
    paddingTop: 10,
    paddingRight: 10
  },
  breadcrumbItem: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  breadcrumbText: {
    fontSize: 13,
    fontWeight: '700'
  },
  breadcrumbSlash: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: '700'
  },
  quickActionStrip: {
    marginBottom: 2
  },
  quickActionStripContent: {
    gap: 8,
    paddingRight: 12
  },
  quickActionChip: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  quickActionText: {
    fontSize: 13,
    fontWeight: '700'
  },
  itemCard: {
    ...TAB_CARD_BASE_STYLE,
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  itemCardSelected: {
    borderWidth: 1.3
  },
  itemPressArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center'
  },
  selectionIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center'
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
    paddingRight: 6
  },
  itemName: {
    fontSize: TAB_TITLE_FONT_SIZE,
    fontWeight: '700'
  },
  itemMeta: {
    marginTop: 5,
    fontSize: TAB_META_FONT_SIZE,
    fontWeight: '600'
  },
  itemSecondaryMeta: {
    marginTop: 4,
    fontSize: TAB_SECONDARY_FONT_SIZE,
    fontWeight: '500'
  },
  itemMoreWrap: {
    width: 30,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyStateCard: {
    ...TAB_CARD_BASE_STYLE,
    paddingHorizontal: 16,
    paddingVertical: 18
  },
  emptyStateTitle: {
    fontSize: 17,
    fontWeight: '800'
  },
  emptyStateBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 22
  },
  loadingWrap: {
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '600'
  },
  errorCard: {
    ...TAB_CARD_BASE_STYLE,
    paddingHorizontal: 14,
    paddingVertical: 14
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '800'
  },
  errorBody: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 21
  },
  inlinePrimaryBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  inlinePrimaryText: {
    fontSize: 13,
    fontWeight: '700'
  },
  previewCard: {
    ...TAB_CARD_BASE_STYLE,
    overflow: 'hidden',
    padding: 12
  },
  previewImage: {
    width: '100%',
    height: 320,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.04)'
  },
  previewText: {
    fontSize: 15,
    lineHeight: 23,
    fontFamily: FONT_MONO
  },
  previewWebViewWrap: {
    height: 360,
    overflow: 'hidden',
    borderRadius: 16
  },
  previewWebView: {
    flex: 1
  },
  actionCard: {
    ...TAB_CARD_BASE_STYLE,
    paddingHorizontal: 14,
    paddingVertical: 14
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10
  },
  actionPill: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  actionPillText: {
    fontSize: 13,
    fontWeight: '700'
  },
  menuRow: {
    ...TAB_CARD_BASE_STYLE,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  menuRowTextWrap: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10
  },
  menuRowTitle: {
    fontSize: 15,
    fontWeight: '700'
  },
  menuRowDesc: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 20
  },
  menuRowAction: {
    fontSize: 13,
    fontWeight: '800'
  },
  bottomSheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end'
  },
  bottomSheetMask: {
    ...StyleSheet.absoluteFillObject
  },
  bottomSheetCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    paddingHorizontal: 12,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: -6
    },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 10
  },
  bottomSheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 999
  },
  bottomSheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 12
  },
  bottomSheetHeaderMain: {
    flex: 1,
    minWidth: 0
  },
  bottomSheetTitle: {
    marginTop: 6,
    fontSize: 18,
    fontWeight: '800'
  },
  bottomSheetMeta: {
    marginTop: 5,
    fontSize: 13,
    fontWeight: '600'
  },
  bottomSheetCloseBtn: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  bottomSheetCloseText: {
    fontSize: 12,
    fontWeight: '800'
  },
  createSheetCard: {
    paddingBottom: 6
  },
  createSheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 12
  },
  createSheetHeaderMain: {
    flex: 1,
    minWidth: 0
  },
  createSheetTitle: {
    marginTop: 6,
    fontSize: 18,
    fontWeight: '800'
  },
  createSheetDesc: {
    marginTop: 5,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600'
  },
  createSheetActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16
  },
  createSheetActionCard: {
    ...TAB_CARD_BASE_STYLE,
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 150,
    paddingHorizontal: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  createSheetActionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  createSheetActionTitle: {
    marginTop: 14,
    fontSize: 16,
    fontWeight: '800'
  },
  createSheetActionDesc: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600'
  },
  bottomSheetBody: {
    maxHeight: 430,
    marginTop: 12
  },
  bottomSheetBodyContent: {
    gap: 8,
    paddingBottom: 4
  },
  bottomSheetMenuRow: {
    minHeight: 74
  },
  taskCard: {
    ...TAB_CARD_BASE_STYLE,
    paddingHorizontal: 14,
    paddingVertical: 14
  },
  taskRowHead: {
    flexDirection: 'row',
    alignItems: 'flex-start'
  },
  taskMain: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '700'
  },
  taskMeta: {
    marginTop: 5,
    fontSize: 12,
    fontWeight: '600'
  },
  taskBadge: {
    fontSize: 12,
    fontWeight: '800'
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    marginTop: 10,
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    borderRadius: 999
  },
  taskActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12
  },
  secondaryBtn: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 9
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '700'
  },
  warningCard: {
    ...TAB_CARD_BASE_STYLE,
    paddingHorizontal: 16,
    paddingVertical: 16
  },
  warningTitle: {
    fontSize: 18,
    fontWeight: '800'
  },
  warningBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 22
  },
  formCard: {
    ...TAB_CARD_BASE_STYLE,
    paddingHorizontal: 14,
    paddingVertical: 14
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8
  },
  formInput: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '600'
  },
  formErrorText: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19
  },
  primaryActionBtn: {
    marginTop: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 18
  },
  primaryActionText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800'
  },
  deleteItemText: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 22,
    marginBottom: 6
  },
  browserDirRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12
  },
  browserDirName: {
    fontSize: 14,
    fontWeight: '700'
  },
  browserDirPath: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '500'
  },
  selectionBar: {
    position: 'absolute',
    left: 14,
    right: 14,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 6
    },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 5
  },
  selectionBarHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  selectionBarTitle: {
    fontSize: 15,
    fontWeight: '800'
  },
  selectionBarDone: {
    fontSize: 13,
    fontWeight: '800'
  },
  selectionBarActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12
  },
  selectionActionBtn: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  selectionActionText: {
    fontSize: 13,
    fontWeight: '700'
  },
  uploadFab: {
    position: 'absolute',
    right: 16,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#214a9a',
    shadowOffset: {
      width: 0,
      height: 8
    },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 8
  }
});
export default styles;
