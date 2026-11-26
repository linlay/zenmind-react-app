import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { shouldCollapseComposerPaste } from '../chatComposerDraft';
import type { ComposerTextInputHandle, ComposerTextInputProps } from './ComposerTextInput.types';

// Web keeps its native textarea and actual ClipboardEvent; native builds resolve the Expo view adapter.
export const ComposerTextInput = forwardRef<ComposerTextInputHandle, ComposerTextInputProps>(function ComposerTextInput(
  { value, onEdit, onContentHeight, height, fontScale, editable, scrollEnabled, placeholder, textColor },
  ref
) {
  const input = useRef<HTMLTextAreaElement>(null);
  const previous = useRef(value);
  useLayoutEffect(() => {
    previous.current = value;
  }, [value]);
  const selection = useRef({ start: 0, end: 0 });
  const eventCount = useRef(0);
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus(), blur: () => input.current?.blur() }), []);
  return (
    <textarea
      ref={input}
      value={value}
      readOnly={!editable}
      placeholder={placeholder}
      aria-label={placeholder}
      className="box-border min-w-0 w-full resize-none border-0 bg-transparent px-0 py-app-sm font-sans outline-none"
      style={{
        height,
        color: textColor,
        fontSize: 16 * fontScale,
        lineHeight: `${22 * fontScale}px`,
        overflowY: scrollEnabled ? 'auto' : 'hidden'
      }}
      onSelect={({ currentTarget }) => {
        selection.current = { start: currentTarget.selectionStart, end: currentTarget.selectionEnd };
      }}
      onPaste={(event) => {
        const text = event.clipboardData.getData('text/plain');
        if (!shouldCollapseComposerPaste(text)) return;
        event.preventDefault();
        const target = event.currentTarget,
          start = target.selectionStart,
          end = target.selectionEnd;
        target.setRangeText('', start, end, 'start');
        previous.current = target.value;
        selection.current = { start, end: start };
        onEdit({
          text: target.value,
          eventCount: ++eventCount.current,
          start,
          end,
          replacement: '',
          pastedText: text,
          selectionStart: start,
          selectionEnd: start
        });
        onContentHeight(target.scrollHeight);
      }}
      onChange={({ currentTarget }) => {
        const text = currentTarget.value,
          before = previous.current;
        let { start, end } = selection.current;
        let nextEnd = start + text.length - (before.length - (end - start));
        if (
          nextEnd < start ||
          before.slice(0, start) !== text.slice(0, start) ||
          before.slice(end) !== text.slice(nextEnd)
        ) {
          end = Math.min(before.length, currentTarget.selectionStart + before.length - text.length);
          nextEnd = currentTarget.selectionStart;
          if (end < 0 || before.slice(end) !== text.slice(nextEnd)) {
            end = before.length;
            nextEnd = text.length;
          }
          start = 0;
          while (start < end && start < nextEnd && before[start] === text[start]) start++;
          while (end > start && nextEnd > start && before[end - 1] === text[nextEnd - 1]) {
            end--;
            nextEnd--;
          }
        }
        previous.current = text;
        onEdit({
          text,
          eventCount: ++eventCount.current,
          start,
          end,
          replacement: text.slice(start, nextEnd),
          selectionStart: currentTarget.selectionStart,
          selectionEnd: currentTarget.selectionEnd
        });
        onContentHeight(currentTarget.scrollHeight);
      }}
    />
  );
});
