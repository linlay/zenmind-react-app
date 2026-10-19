import { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../../shared/components/ScreenHeader';
import { useT } from '../../../shared/i18n';
import {
  MAX_SELECTED_TEXT_CHARACTERS,
  MAX_SELECTION_ANNOTATION_CHARACTERS,
  readSelectedRange
} from '../chatSelectionReference.ts';

const SOURCE_TEXT_CLASS =
  'min-h-0 flex-1 mx-app-md border border-app-line rounded-app-md p-app-md text-app-body text-app-primary';

export function ChatSelectionSheet({
  text,
  annotation = '',
  sourceKind = 'message',
  selectRange = false,
  onSave,
  onClose,
  title: customTitle
}: {
  title?: string;
  text: string;
  annotation?: string;
  sourceKind?: 'message' | 'code';
  selectRange?: boolean;
  onSave?: (text: string, annotation: string, sourceKind: 'message' | 'code') => boolean;
  onClose: () => void;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);
  const window = useMemo(() => {
    const stride = MAX_SELECTED_TEXT_CHARACTERS;
    let start = page * stride,
      end = Math.min(text.length, start + stride * 2);
    if (start > 0 && /[\uDC00-\uDFFF]/.test(text[start]) && /[\uD800-\uDBFF]/.test(text[start - 1])) start--;
    if (end < text.length && /[\uDC00-\uDFFF]/.test(text[end]) && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    return { text: text.slice(start, end), start, end };
  }, [page, text]);
  const inputRef = useRef<TextInput>(null);
  const [selected, setSelected] = useState<string | null>(selectRange ? null : text);
  const [comment, setComment] = useState(annotation);
  const [kind, setKind] = useState(sourceKind);
  const title = customTitle || (selectRange ? t('selection.select') : t('selection.reference'));
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-app-background">
        <KeyboardAvoidingView
          className="min-h-0 flex-1"
          behavior="padding"
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
        >
          <ScreenHeader
            title={title}
            leftActions={[
              <Pressable key="close" onPress={onClose} accessibilityRole="button" className="px-app-sm py-app-sm">
                <Text className="text-app-footnote text-app-brand">{t('selection.close')}</Text>
              </Pressable>
            ]}
            rightActions={
              onSave
                ? [
                    <Pressable
                      key="save"
                      disabled={!selected}
                      onPress={() => {
                        if (selected && onSave(selected, comment, kind)) onClose();
                      }}
                      accessibilityRole="button"
                      className={!selected ? 'opacity-40 px-app-sm py-app-sm' : 'px-app-sm py-app-sm'}
                    >
                      <Text className="text-app-footnote font-semibold text-app-brand">{t('selection.save')}</Text>
                    </Pressable>
                  ]
                : []
            }
          />
          {selectRange ? (
            <>
              <Text className="px-app-md py-app-sm text-app-caption text-app-secondary">{t('selection.hint')}</Text>
              <TextInput
                key={page}
                ref={inputRef}
                value={window.text}
                multiline
                scrollEnabled
                showSoftInputOnFocus={false}
                editable={Platform.OS === 'android' || Platform.OS === 'web'}
                onChangeText={(value) => {
                  if (value === window.text) return;
                  inputRef.current?.setNativeProps({ text: window.text });
                  setSelected(null);
                }}
                onSelectionChange={(event) => {
                  const { start, end } = event.nativeEvent.selection;
                  // Focus changes collapse the native range without cancelling the saved quote.
                  if (start === end) return;
                  setSelected(readSelectedRange(window.text, start, end));
                }}
                autoCorrect={false}
                spellCheck={false}
                textAlignVertical="top"
                accessibilityLabel={t('selection.source')}
                className={SOURCE_TEXT_CLASS}
              />
              {text.length > MAX_SELECTED_TEXT_CHARACTERS * 2 ? (
                <View className="flex-row items-center justify-between px-app-md py-app-sm">
                  <Pressable
                    disabled={page === 0}
                    onPress={() => {
                      setSelected(null);
                      setPage(page - 1);
                    }}
                    accessibilityRole="button"
                  >
                    <Text className="text-app-footnote text-app-brand">{t('selection.previous')}</Text>
                  </Pressable>
                  <Text className="text-app-caption text-app-secondary">
                    {window.start + 1}–{window.end}
                  </Text>
                  <Pressable
                    disabled={window.end === text.length}
                    onPress={() => {
                      setSelected(null);
                      setPage(page + 1);
                    }}
                    accessibilityRole="button"
                  >
                    <Text className="text-app-footnote text-app-brand">{t('selection.next')}</Text>
                  </Pressable>
                </View>
              ) : null}
              <View className="flex-row gap-app-md px-app-md py-app-sm">
                {(['message', 'code'] as const).map((value) => (
                  <Pressable
                    key={value}
                    onPress={() => setKind(value)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: kind === value }}
                  >
                    <Text
                      className={
                        kind === value
                          ? 'text-app-footnote font-semibold text-app-brand'
                          : 'text-app-footnote text-app-secondary'
                      }
                    >
                      {t(value === 'code' ? 'selection.code' : 'selection.text')}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text numberOfLines={2} className="px-app-md text-app-caption text-app-secondary">
                {selected || t('selection.none')}
              </Text>
            </>
          ) : (
            <ScrollView className="flex-1 px-app-md" keyboardShouldPersistTaps="handled">
              <Text selectable className="py-app-md text-app-body text-app-primary">
                {text}
              </Text>
            </ScrollView>
          )}
          {onSave ? (
            <TextInput
              value={comment}
              onChangeText={setComment}
              multiline
              scrollEnabled
              textAlignVertical="top"
              maxLength={MAX_SELECTION_ANNOTATION_CHARACTERS}
              accessibilityLabel={t('selection.annotation')}
              placeholder={t('selection.annotation')}
              className="mx-app-md my-app-sm max-h-32 min-h-12 rounded-app-md border border-app-line p-app-md text-app-body text-app-primary"
            />
          ) : annotation ? (
            <Text selectable className="px-app-md py-app-sm text-app-body text-app-secondary">
              {annotation}
            </Text>
          ) : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
