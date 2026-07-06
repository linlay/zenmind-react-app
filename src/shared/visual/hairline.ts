import { StyleSheet } from 'react-native';

export const appHairlineStyles = StyleSheet.create({
  borderBottom: {
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  borderTopBottom: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  borderLeft: {
    borderLeftWidth: StyleSheet.hairlineWidth
  },
  borderRight: {
    borderRightWidth: StyleSheet.hairlineWidth
  }
});
