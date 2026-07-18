import {
  CONVERSATION_PREVIEW_MAX_ALIAS_LENGTH,
  getConversationPreviewKind,
  type ConversationPreviewKind
} from './previewRegistry.ts';

export type { ConversationPreviewKind } from './previewRegistry';

export type ConversationMarkdownFenceExtension = {
  key: string;
  aliases: readonly string[];
  parse: (input: {
    language: string;
    source: string;
    sourceHash: string;
  }) => unknown | null;
};

export type ConversationMarkdownFenceExtensionSegment = {
  type: 'extension';
  key: string;
  extensionKey: string;
  language: string;
  source: string;
  sourceHash: string;
  rawMarkdown: string;
  data: unknown;
};

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
    }
  | ConversationMarkdownFenceExtensionSegment;

type ActiveFence = {
  start: number;
  bodyStart: number;
  marker: '`' | '~';
  minimumLength: number;
  extension: ConversationMarkdownFenceExtension | null;
  previewKind: ConversationPreviewKind | null;
  language: string;
};

type ParserState = {
  activeFence: ActiveFence | null;
  completedSegments: ConversationMarkdownSegment[];
  markdownStart: number;
  occurrences: Record<string, number>;
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
  extensionByAlias: ReadonlyMap<string, ConversationMarkdownFenceExtension>;
  lineStart: number;
  maximumAliasLength: number;
  parser: ParserState;
  pendingCarriageReturn: number | null;
  scanOffset: number;
};

function createParserState(): ParserState {
  return {
    activeFence: null,
    completedSegments: [],
    markdownStart: 0,
    occurrences: {}
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

function updateOpeningLanguage(
  candidate: FenceLineCandidate,
  character: string,
  maximumAliasLength: number
): void {
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
  if (candidate.language.length > maximumAliasLength) {
    candidate.languageComplete = true;
  }
}

function updateFenceLineCandidate(
  candidate: FenceLineCandidate,
  character: string,
  insideFence: boolean,
  maximumAliasLength: number
): void {
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
  updateOpeningLanguage(candidate, character, maximumAliasLength);
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
  lineNext: number,
  extensionByAlias: ReadonlyMap<string, ConversationMarkdownFenceExtension>
): void {
  const activeFence = state.activeFence;
  if (activeFence) {
    if (!isClosingCandidate(candidate, activeFence)) {
      return;
    }
    const source = content.slice(activeFence.bodyStart, lineStart).replace(/(?:\r\n|\r|\n)$/, '');
    const sourceHash = hashConversationPreviewSource(source);
    let extensionData: unknown = null;
    try {
      extensionData = activeFence.extension?.parse({
        language: activeFence.language,
        source,
        sourceHash
      });
    } catch {
      extensionData = null;
    }
    if (activeFence.previewKind || (activeFence.extension && extensionData != null)) {
      appendCompletedMarkdown(state, content, activeFence.start);
      const segmentKind = activeFence.previewKind ?? activeFence.extension!.key;
      const occurrence = state.occurrences[segmentKind] ?? 0;
      state.occurrences[segmentKind] = occurrence + 1;
      if (activeFence.extension) {
        state.completedSegments.push({
          type: 'extension',
          key: `extension:${segmentKind}:${occurrence}:${sourceHash}`,
          extensionKey: activeFence.extension.key,
          language: activeFence.language,
          source,
          sourceHash,
          rawMarkdown: content.slice(activeFence.start, lineNext),
          data: extensionData
        });
      } else {
        state.completedSegments.push({
          type: activeFence.previewKind!,
          key: `${activeFence.previewKind!}:${occurrence}:${sourceHash}`,
          language: activeFence.language,
          source,
          sourceHash
        });
      }
      state.markdownStart = lineNext;
    }
    state.activeFence = null;
    return;
  }

  if (candidate.invalid || !candidate.marker || candidate.markerCount < 3) {
    return;
  }
  const previewKind = getConversationPreviewKind(candidate.language);
  const extension = previewKind ? null : extensionByAlias.get(candidate.language) ?? null;
  state.activeFence = {
    start: lineStart,
    bodyStart: lineNext,
    marker: candidate.marker,
    minimumLength: candidate.markerCount,
    extension,
    previewKind,
    language: candidate.language || previewKind || extension?.key || ''
  };
}

function resetLine(scanner: ScannerState, lineStart: number): void {
  scanner.candidate = createFenceLineCandidate();
  scanner.lineStart = lineStart;
}

function finishCommittedLine(scanner: ScannerState, content: string, lineNext: number): void {
  applyCompletedLine(
    scanner.parser,
    scanner.candidate,
    content,
    scanner.lineStart,
    lineNext,
    scanner.extensionByAlias
  );
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
    updateFenceLineCandidate(
      scanner.candidate,
      character,
      scanner.parser.activeFence !== null,
      scanner.maximumAliasLength
    );
  }
  scanner.scanOffset = content.length;
}

function materializeSegments(scanner: ScannerState, content: string): ConversationMarkdownSegment[] {
  const displayState = cloneParserState(scanner.parser);
  if (scanner.lineStart < content.length) {
    applyCompletedLine(
      displayState,
      scanner.candidate,
      content,
      scanner.lineStart,
      content.length,
      scanner.extensionByAlias
    );
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

function createScannerState(
  extensionByAlias: ReadonlyMap<string, ConversationMarkdownFenceExtension>,
  maximumAliasLength: number
): ScannerState {
  return {
    candidate: createFenceLineCandidate(),
    extensionByAlias,
    lineStart: 0,
    maximumAliasLength,
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

export type ConversationMarkdownSegmentParserOptions = {
  extensions?: readonly ConversationMarkdownFenceExtension[];
  onScan?: ConversationMarkdownSegmentScanObserver;
};

function buildExtensionConfiguration(extensions: readonly ConversationMarkdownFenceExtension[]) {
  const extensionByAlias = new Map<string, ConversationMarkdownFenceExtension>();
  let maximumAliasLength = CONVERSATION_PREVIEW_MAX_ALIAS_LENGTH;
  extensions.forEach((extension) => {
    extension.aliases.forEach((rawAlias) => {
      const alias = rawAlias.trim().toLowerCase();
      if (!alias || getConversationPreviewKind(alias)) {
        return;
      }
      extensionByAlias.set(alias, extension);
      maximumAliasLength = Math.max(maximumAliasLength, alias.length);
    });
  });
  return { extensionByAlias, maximumAliasLength };
}

export function createConversationMarkdownSegmentCache(
  options: ConversationMarkdownSegmentParserOptions = {}
): ConversationMarkdownSegmentCache {
  const { extensionByAlias, maximumAliasLength } = buildExtensionConfiguration(options.extensions ?? []);
  let hasPreviousContent = false;
  let previousContent = '';
  let scanner = createScannerState(extensionByAlias, maximumAliasLength);
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
        scanner = createScannerState(extensionByAlias, maximumAliasLength);
      }
      const scanStart = scanner.scanOffset;
      scanAppendedContent(scanner, content, scanStart);
      options.onScan?.(content.length - scanStart, !appended);
      previousContent = content;
      hasPreviousContent = true;
      previousSegments = materializeSegments(scanner, content);
      return previousSegments;
    },
    reset() {
      hasPreviousContent = false;
      previousContent = '';
      previousSegments = [];
      scanner = createScannerState(extensionByAlias, maximumAliasLength);
    }
  };
  return cache;
}

export function parseConversationMarkdownSegments(
  content: string,
  options: ConversationMarkdownSegmentParserOptions = {}
): ConversationMarkdownSegment[] {
  return createConversationMarkdownSegmentCache(options).parse(content);
}
