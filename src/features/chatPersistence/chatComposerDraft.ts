export type ComposerPaste = { id: string; text: string; offset: number };
export type ChatComposerDraft = { input: string; pastes: readonly ComposerPaste[] };

export type ComposerTextEdit = {
  text: string;
  eventCount: number;
  start: number;
  end: number;
  replacement: string;
  selectionStart: number;
  selectionEnd: number;
  pastedText?: string;
};

export function createComposerDraft(input = ''): ChatComposerDraft {
  return { input, pastes: [] };
}

export function shouldCollapseComposerPaste(text: string): boolean {
  return Boolean(text.trim()) && (text.length >= 2000 || text.split(/\r\n|\r|\n/).length >= 20);
}

export function serializeComposerDraft(draft: ChatComposerDraft): string {
  let position = 0;
  const parts: string[] = [];
  for (const paste of draft.pastes) {
    parts.push(draft.input.slice(position, paste.offset), paste.text);
    position = paste.offset;
  }
  return [...parts, draft.input.slice(position)].join('');
}

function replaceVisibleRange(draft: ChatComposerDraft, start: number, end: number, text: string): ChatComposerDraft {
  const delta = text.length - (end - start);
  return {
    input: draft.input.slice(0, start) + text + draft.input.slice(end),
    pastes: draft.pastes.map((paste) => ({
      ...paste,
      offset: paste.offset <= start ? paste.offset : paste.offset < end ? start : paste.offset + delta
    }))
  };
}

// Native ranges are UTF-16 offsets, as are JS string indices. Only an explicit system-paste event folds text.
export function applyComposerTextEdit(
  draft: ChatComposerDraft,
  edit: ComposerTextEdit,
  pasteId: string
): ChatComposerDraft {
  const next = replaceVisibleRange(draft, edit.start, edit.end, edit.replacement);
  if (edit.pastedText === undefined) return next;
  return {
    ...next,
    pastes: [...next.pastes, { id: pasteId, text: edit.pastedText, offset: edit.start }].sort(
      (a, b) => a.offset - b.offset
    )
  };
}

export function editComposerPaste(draft: ChatComposerDraft, id: string, text: string): ChatComposerDraft {
  return {
    ...draft,
    pastes: draft.pastes.flatMap((paste) => (paste.id !== id ? [paste] : text === '' ? [] : [{ ...paste, text }]))
  };
}

export function appendComposerDraft(current: ChatComposerDraft, restored: ChatComposerDraft): ChatComposerDraft {
  if (!serializeComposerDraft(current)) return restored;
  if (!serializeComposerDraft(restored)) return current;
  const offset = current.input.length + 2;
  return {
    input: `${current.input}\n\n${restored.input}`,
    pastes: [...current.pastes, ...restored.pastes.map((paste) => ({ ...paste, offset: paste.offset + offset }))]
  };
}
