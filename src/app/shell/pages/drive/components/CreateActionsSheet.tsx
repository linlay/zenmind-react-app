import { Modal, Pressable, Text, TouchableOpacity, View } from 'react-native';

import { AppTheme } from '../../../../../core/constants/theme';
import { DrivePalette } from '../types';
import { FolderIcon, UploadIcon } from './Icons';
import styles from '../DriveContent.styles';

interface CreateActionsSheetProps {
  visible: boolean;
  palette: DrivePalette;
  theme: AppTheme;
  bottomInset: number;
  onClose: () => void;
  onSelectAction: (action: 'upload' | 'create-folder') => void;
}

export function CreateActionsSheet({
  visible,
  palette,
  theme,
  bottomInset,
  onClose,
  onSelectAction
}: CreateActionsSheetProps) {
  if (!visible) {
    return null;
  }

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <View style={styles.bottomSheetOverlay}>
        <Pressable style={[styles.bottomSheetMask, { backgroundColor: palette.overlay }]} onPress={onClose} />

        <View
          style={[
            styles.bottomSheetCard,
            styles.createSheetCard,
            {
              backgroundColor: theme.surfaceStrong,
              borderColor: palette.cardBorder,
              paddingBottom: Math.max(bottomInset, 14) + 8
            }
          ]}
        >
          <View style={[styles.bottomSheetHandle, { backgroundColor: palette.cardBorder }]} />

          <View style={styles.createSheetActions}>
            <TouchableOpacity
              activeOpacity={0.84}
              style={[
                styles.createSheetActionCard,
                { backgroundColor: theme.surface, borderColor: palette.cardBorder }
              ]}
              onPress={() => onSelectAction('upload')}
            >
              <View style={[styles.createSheetActionIconWrap, { backgroundColor: palette.primarySoft }]}>
                <UploadIcon color={palette.primaryDeep} />
              </View>
              <Text style={[styles.createSheetActionTitle, { color: palette.text }]}>上传文件</Text>
              <Text style={[styles.createSheetActionDesc, { color: palette.textSoft }]}>从本机选取文件并上传</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.84}
              style={[
                styles.createSheetActionCard,
                { backgroundColor: theme.surface, borderColor: palette.cardBorder }
              ]}
              onPress={() => onSelectAction('create-folder')}
            >
              <View style={[styles.createSheetActionIconWrap, { backgroundColor: palette.primarySoft }]}>
                <FolderIcon color={palette.primaryDeep} />
              </View>
              <Text style={[styles.createSheetActionTitle, { color: palette.text }]}>新建目录</Text>
              <Text style={[styles.createSheetActionDesc, { color: palette.textSoft }]}>在当前目录创建子文件夹</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
