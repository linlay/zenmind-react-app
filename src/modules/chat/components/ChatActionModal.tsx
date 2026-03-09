import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { styles } from '../screens/ChatAssistantScreen.styles';

interface ChatActionModalProps {
  visible: boolean;
  title: string;
  content: string;
  closeText: string;
  theme: {
    overlay: string;
    surfaceStrong: string;
    text: string;
    textSoft: string;
    primarySoft: string;
    primaryDeep: string;
  };
  onClose: () => void;
}

export function ChatActionModal({ visible, title, content, closeText, theme, onClose }: ChatActionModalProps) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={[styles.actionModalOverlay, { backgroundColor: theme.overlay }]}>
        <View style={[styles.actionModalCard, { backgroundColor: theme.surfaceStrong }]}>
          <Text style={[styles.actionModalTitle, { color: theme.text }]}>{title || '提示'}</Text>
          <Text style={[styles.actionModalContent, { color: theme.textSoft }]}>{content || ' '}</Text>
          <TouchableOpacity activeOpacity={0.82} style={[styles.actionModalBtn, { backgroundColor: theme.primarySoft }]} onPress={onClose}>
            <Text style={[styles.actionModalBtnText, { color: theme.primaryDeep }]}>{closeText || '关闭'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
