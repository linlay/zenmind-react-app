import {
  CONVERSATION_PREVIEW_MAX_ALIAS_LENGTH,
  getConversationPreviewKind,
  type ConversationPreviewKind
} from './previewRegistry.ts';

export type { ConversationPreviewKind } from './previewRegistry';

export type ConversationMarkdownSegment =
  | {
      type: 'markdown';
      key: string;
      markdown: string;
    }
  | {
      type: ConversationPreviewKind;
      key: string;
      language: string;
      source: string;
      sourceHash: string;
    };

type ActiveFence = {
  start: number;
  bodyStart: number;
  marker: '`' | '~';
  minimumLength: number;
  previewKind: ConversationPreviewKind | null;
  language: string;
};

type ParserState = {
  activeFence: ActiveFence | null;
  completedSegments: ConversationMarkdownSegment[];
  markdownStart: number;
  occurrences: Record<ConversationPreviewKind, number>;
};

type FenceLineCandidate = {
  invalid: boolean;
  leadingSpaces: number;
  marker: '`' | '~' | null;
  markerCount: number;
  stage: 'indent' | 'marker' | 'suffix';
  suffixHasNonWhitespace: boolean;
  language: string;
  languageComplete: boolean;
  languageStarted: boolean;
};

type ScannerState = {
  candidate: FenceLineCandidate;
  lineStart: number;
  parser: ParserState;
  pendingCarriageReturn: number | null;
  scanOffset: number;
};

function createParserState(): ParserState {
  return {
    activeFence: null,
    completedSegments: [],
    markdownStart: 0,
    occurrences: { mermaid: 0, echarts: 0, html: 0 }
  };
}

function cloneParserState(state: ParserState): ParserState {
  return {
    activeFence: state.activeFence ? { ...state.activeFence } : null,
    completedSegments: [...state.completedSegments],
    markdownStart: state.markdownStart,
    occurrences: { ...state.occurrences }
  };
}

function createFenceLineCandidate(): FenceLineCandidate {
  return {
    invalid: false,
    leadingSpaces: 0,
    marker: null,
    markerCount: 0,
    stage: 'indent',
    suffixHasNonWhitespace: false,
    language: '',
    languageComplete: false,
    languageStarted: false
  };
}

export function hashConversationPreviewSource(source: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function updateOpeningLanguage(candidate: FenceLineCandidate, character: string): void {
  if (candidate.languageComplete) {
    return;
  }
  if (character === ' ' || character === '\t') {
    if (candidate.languageStarted) {
      candidate.languageComplete = true;
    }
    return;
  }
  candidate.languageStarted = true;
  candidate.language += character.toLowerCase();
  if (candidate.language.length > CONVERSATION_PREVIEW_MAX_ALIAS_LENGTH) {
    candidate.languageComplete = true;
  }
}

function updateFenceLineCandidate(candidate: FenceLineCandidate, character: string, insideFence: boolean): void {
  if (candidate.invalid) {
    return;
  }

  if (candidate.stage === 'indent') {
    if (character === ' ' && candidate.leadingSpaces < 3) {
      candidate.leadingSpaces += 1;
      return;
    }
    if (character !== '`' && character !== '~') {
      candidate.invalid = true;
      return;
    }
    candidate.marker = character;
    candidate.markerCount = 1;
    candidate.stage = 'marker';
    return;
  }

  if (candidate.stage === 'marker') {
    if (character === candidate.marker) {
      candidate.markerCount += 1;
      return;
    }
    candidate.stage = 'suffix';
  }

  if (insideFence) {
    if (character !== ' ' && character !== '\t') {
      candidate.suffixHasNonWhitespace = true;
    }
    return;
  }
  updateOpeningLanguage(candidate, character);
}

function isClosingCandidate(candidate: FenceLineCandidate, fence: ActiveFence): boolean {
  return (
    !candidate.invalid &&
    candidate.marker === fence.marker &&
    candidate.markerCount >= fence.minimumLength &&
    !candidate.suffixHasNonWhitespace
  );
}

function appendCompletedMarkdown(state: ParserState, content: string, end: number): void {
  if (end <= state.markdownStart) {
    return;
  }
  const start = state.markdownStart;
  state.completedSegments.push({
    type: 'markdown',
    key: `markdown:${start}`,
    markdown: content.slice(start, end)
  });
}

function applyCompletedLine(
  state: ParserState,
  candidate: FenceLineCandidate,
  content: string,
  lineStart: number,
  lineNext: number
): void {
  const activeFence = state.activeFence;
  if (activeFence) {
    if (!isClosingCandidate(candidate, activeFence)) {
      return;
    }
    if (activeFence.previewKind) {
      appendCompletedMarkdown(state, content, activeFence.start);
      const source = content.slice(activeFence.bodyStart, lineStart).replace(/(?:\r\n|\r|\n)$/, '');
      const sourceHash = hashConversationPreviewSource(source);
      const occurrence = state.occurrences[activeFence.previewKind];
      state.occurrences[activeFence.previewKind] += 1;
      state.completedSegments.push({
        type: activeFence.previewKind,
        key: `${activeFence.previewKind}:${occurrence}:${sourceHash}`,
        language: activeFence.language,
        source,
        sourceHash
      });
      state.markdownStart = lineNext;
    }
    state.activeFence = null;
    return;
  }

  if (candidate.invalid || !candidate.marker || candidate.markerCount < 3) {
    return;
  }
  const previewKind = getConversationPreviewKind(candidate.language);
  state.activeFence = {
    start: lineStart,
    bodyStart: lineNext,
    marker: candidate.marker,
    minimumLength: candidate.markerCount,
    previewKind,
    language: candidate.language || previewKind || ''
  };
}

function resetLine(scanner: ScannerState, lineStart: number): void {
  scanner.candidate = createFenceLineCandidate();
  scanner.lineStart = lineStart;
}

function finishCommittedLine(scanner: ScannerState, content: string, lineNext: number): void {
  applyCompletedLine(scanner.parser, scanner.candidate, content, scanner.lineStart, lineNext);
  resetLine(scanner, lineNext);
}

function scanAppendedContent(scanner: ScannerState, content: string, startOffset: number): void {
  for (let index = startOffset; index < content.length; index += 1) {
    const character = content[index];
    if (scanner.pendingCarriageReturn !== null) {
      const carriageReturn = scanner.pendingCarriageReturn;
      scanner.pendingCarriageReturn = null;
      if (character === '\n') {
        finishCommittedLine(scanner, content, index + 1);
        continue;
      }
      finishCommittedLine(scanner, content, carriageReturn + 1);
    }

    if (character === '\r') {
      scanner.pendingCarriageReturn = index;
      continue;
    }
    if (character === '\n') {
      finishCommittedLine(scanner, content, index + 1);
      continue;
    }
    updateFenceLineCandidate(scanner.candidate, character, scanner.parser.activeFence !== null);
  }
  scanner.scanOffset = content.length;
}

function materializeSegments(scanner: ScannerState, content: string): ConversationMarkdownSegment[] {
  const displayState = cloneParserState(scanner.parser);
  if (scanner.lineStart < content.length) {
    applyCompletedLine(displayState, scanner.candidate, content, scanner.lineStart, content.length);
  }
  const segments = [...displayState.completedSegments];
  if (displayState.markdownStart < content.length) {
    segments.push({
      type: 'markdown',
      key: `markdown:${displayState.markdownStart}`,
      markdown: content.slice(displayState.markdownStart)
    });
  }
  return segments;
}

function createScannerState(): ScannerState {
  return {
    candidate: createFenceLineCandidate(),
    lineStart: 0,
    parser: createParserState(),
    pendingCarriageReturn: null,
    scanOffset: 0
  };
}

export type ConversationMarkdownSegmentCache = {
  parse: (content: string) => ConversationMarkdownSegment[];
  reset: () => void;
};

type ConversationMarkdownSegmentScanObserver = (scannedCharacters: number, fullParse: boolean) => void;

export function createConversationMarkdownSegmentCache(
  onScan?: ConversationMarkdownSegmentScanObserver
): ConversationMarkdownSegmentCache {
  let hasPreviousContent = false;
  let previousContent = '';
  let scanner = createScannerState();
  let previousSegments: ConversationMarkdownSegment[] = [];
  const cache: ConversationMarkdownSegmentCache = {
    parse(input: string) {
      const content = String(input || '');
      if (hasPreviousContent && content === previousContent) {
        return previousSegments;
      }
      const appended =
        hasPreviousContent && content.length >= previousContent.length && content.startsWith(previousContent);
      if (!appended) {
        scanner = createScannerState();
      }
      const scanStart = scanner.scanOffset;
      scanAppendedContent(scanner, content, scanStart);
      onScan?.(content.length - scanStart, !appended);
      previousContent = content;
      hasPreviousContent = true;
      previousSegments = materializeSegments(scanner, content);
      return previousSegments;
    },
    reset() {
      hasPreviousContent = false;
      previousContent = '';
      previousSegments = [];
      scanner = createScannerState();
    }
  };
  return cache;
}

export function parseConversationMarkdownSegments(content: string): ConversationMarkdownSegment[] {
  return createConversationMarkdownSegmentCache().parse(content);
}
