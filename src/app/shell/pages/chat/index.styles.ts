import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  domainContent: {
    flex: 1
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
});
