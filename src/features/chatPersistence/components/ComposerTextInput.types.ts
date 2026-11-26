import type { ComposerTextEdit } from '../chatComposerDraft';

export type ComposerTextInputHandle = { focus: () => void; blur: () => void };
export type ComposerTextInputProps = {
  value: string;
  onEdit: (edit: ComposerTextEdit) => void;
  onContentHeight: (height: number) => void;
  height: number;
  fontScale: number;
  editable: boolean;
  scrollEnabled: boolean;
  placeholder: string;
  placeholderTextColor: string;
  textColor: string;
};
