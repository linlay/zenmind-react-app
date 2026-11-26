import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../../shared/components/ScreenHeader';
import { useT } from '../../../shared/i18n';

export function ChatPastedTextEditor({
  text,
  onSave,
  onClose,
  onDismiss
}: {
  text: string;
  onSave: (text: string) => void;
  onClose: () => void;
  onDismiss: () => void;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState(text);
  return (
    <Modal visible animationType="none" onRequestClose={onClose} onDismiss={onDismiss}>
      <SafeAreaView className="flex-1 bg-app-background">
        <KeyboardAvoidingView
          className="min-h-0 flex-1"
          behavior="padding"
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
        >
          <ScreenHeader
            title={t('composer.paste.title')}
            leftActions={[
              <Pressable key="cancel" onPress={onClose} accessibilityRole="button" className="px-app-sm py-app-sm">
                <Text className="text-app-brand">{t('common.cancel')}</Text>
              </Pressable>
            ]}
            rightActions={[
              <Pressable
                key="save"
                onPress={() => onSave(value)}
                accessibilityRole="button"
                className="px-app-sm py-app-sm"
              >
                <Text className="font-semibold text-app-brand">{t('selection.save')}</Text>
              </Pressable>
            ]}
          />
          <Text className="px-app-md py-app-sm text-app-caption text-app-secondary">
            {t('composer.paste.characters', { count: value.length })}
          </Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            multiline
            scrollEnabled
            autoFocus
            textAlignVertical="top"
            accessibilityLabel={t('composer.paste.title')}
            className="min-h-0 flex-1 mx-app-md mb-app-sm rounded-app-md border border-app-line p-app-md text-app-body text-app-primary"
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
