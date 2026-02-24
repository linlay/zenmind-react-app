// @ts-nocheck
import MarkdownIt from 'markdown-it';

export interface StreamingMarkdownBlock {
  key: string;
  content: string;
  tokenType: string;
  startLine: number;
  endLine: number;
}

export interface StreamingBlockPartition {
  frozenBlocks: StreamingMarkdownBlock[];
  tailBlock: StreamingMarkdownBlock | null;
}

const markdown = new MarkdownIt({ typographer: true });
const RENDERABLE_LEAF_BLOCK_TOKEN_TYPES = new Set([
  'paragraph_open',
  'heading_open',
  'fence',
  'code_block',
  'table_open',
  'html_block',
  'hr'
]);

function collectLineStarts(text: string): number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) {
      starts.push(index + 1);
    }
  }
  return starts;
}

function lineToOffset(lineStarts: number[], line: number, textLength: number): number {
  const safeLine = Number(line);
  if (!Number.isFinite(safeLine) || safeLine <= 0) return 0;
  if (safeLine >= lineStarts.length) return textLength;
  return lineStarts[safeLine];
}

function isRenderableLeafBlockToken(token: any): boolean {
  if (!token || !token.block) return false;
  if (typeof token.type !== 'string' || !token.type) return false;
  if (!RENDERABLE_LEAF_BLOCK_TOKEN_TYPES.has(token.type)) return false;
  if (token.nesting < 0 || token.type.endsWith('_close')) return false;
  if (!Array.isArray(token.map) || token.map.length < 2) return false;
  return true;
}

function normalizeTokenRanges(tokens: any[]): Array<{ startLine: number; endLine: number; tokenType: string }> {
  const ranges: Array<{ startLine: number; endLine: number; tokenType: string }> = [];
  for (const token of tokens) {
    if (!isRenderableLeafBlockToken(token)) continue;
    const startLine = Number(token.map[0]);
    const endLine = Number(token.map[1]);
    if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine < 0 || endLine < startLine) {
      continue;
    }
    ranges.push({
      startLine,
      endLine,
      tokenType: String(token.type || 'unknown')
    });
  }

  const deduped: Array<{ startLine: number; endLine: number; tokenType: string }> = [];
  const seen = new Set<string>();
  for (const range of ranges) {
    const key = `${range.startLine}:${range.endLine}:${range.tokenType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(range);
  }

  deduped.sort((left, right) => {
    if (left.startLine !== right.startLine) return left.startLine - right.startLine;
    if (left.endLine !== right.endLine) return left.endLine - right.endLine;
    return left.tokenType.localeCompare(right.tokenType);
  });

  return deduped;
}

function hasTrailingBlankLine(text: string): boolean {
  return /\r?\n[ \t]*\r?\n[ \t]*$/.test(String(text || ''));
}

function hasSingleTrailingNewline(text: string): boolean {
  const value = String(text || '');
  if (!/\r?\n[ \t]*$/.test(value)) return false;
  return !hasTrailingBlankLine(value);
}

function hasExplicitFenceClosure(content: string): boolean {
  const lines = String(content || '').replace(/\r/g, '').split('\n');
  if (lines.length < 2) return false;

  const firstNonEmpty = lines.find((line) => String(line || '').trim().length > 0) || '';
  const openMatch = firstNonEmpty.trimStart().match(/^(`{3,}|~{3,})/);
  if (!openMatch) return false;

  const fenceChar = openMatch[1][0];
  const minLength = openMatch[1].length;
  for (let index = lines.length - 1; index >= 1; index -= 1) {
    const line = String(lines[index] || '').trim();
    if (!line) continue;
    const closeMatch = line.match(/^([`~]{3,})\s*$/);
    if (!closeMatch) return false;
    const marker = closeMatch[1] || '';
    if (marker[0] !== fenceChar) return false;
    return marker.length >= minLength;
  }

  return false;
}

function paragraphContainsImageToken(content: string): boolean {
  if (!content) return false;
  const tokens = markdown.parse(String(content), {});
  for (const token of tokens) {
    if (token.type !== 'inline') continue;
    const children = Array.isArray(token.children) ? token.children : [];
    if (children.some((child) => child?.type === 'image')) {
      return true;
    }
  }
  return false;
}

function shouldEarlyFreezeImageParagraphBySingleNewline(text: string, tailBlock: StreamingMarkdownBlock): boolean {
  if (!tailBlock) return false;
  if (tailBlock.tokenType !== 'paragraph_open') return false;
  if (!hasSingleTrailingNewline(text)) return false;
  return paragraphContainsImageToken(tailBlock.content);
}

function shouldEarlyFreezeTailBlock(text: string, tailBlock: StreamingMarkdownBlock): boolean {
  if (!tailBlock) return false;
  if (shouldEarlyFreezeImageParagraphBySingleNewline(text, tailBlock)) return true;
  if (hasTrailingBlankLine(text)) return true;
  if (tailBlock.tokenType === 'fence' && hasExplicitFenceClosure(tailBlock.content)) {
    return true;
  }
  return false;
}

export function splitStreamingMarkdownBlocks(rawText: string): StreamingMarkdownBlock[] {
  const text = String(rawText || '');
  if (!text) return [];

  const tokens = markdown.parse(text, {});
  const ranges = normalizeTokenRanges(tokens);
  if (!ranges.length) {
    return [
      {
        key: `fallback:0:${text.length}`,
        content: text,
        tokenType: 'fallback',
        startLine: 0,
        endLine: Number.MAX_SAFE_INTEGER
      }
    ];
  }

  const lineStarts = collectLineStarts(text);
  return ranges
    .map((range) => {
      const startOffset = lineToOffset(lineStarts, range.startLine, text.length);
      const endOffset = lineToOffset(lineStarts, range.endLine, text.length);
      const content = text.slice(startOffset, Math.max(startOffset, endOffset));
      return {
        key: `${range.startLine}:${range.endLine}:${range.tokenType}`,
        content,
        tokenType: range.tokenType,
        startLine: range.startLine,
        endLine: range.endLine
      };
    })
    .filter((block) => Boolean(String(block.content || '').length));
}

export function partitionStreamingBlocks(
  rawText: string,
  prevFrozenBlocks?: StreamingMarkdownBlock[]
): StreamingBlockPartition {
  const text = String(rawText || '');
  const blocks = splitStreamingMarkdownBlocks(text);
  if (!blocks.length) {
    return {
      frozenBlocks: [],
      tailBlock: null
    };
  }

  const frozenBlocks = blocks.slice(0, -1);
  let tailBlock = blocks[blocks.length - 1] || null;
  if (!tailBlock) {
    return {
      frozenBlocks,
      tailBlock: null
    };
  }

  if (shouldEarlyFreezeTailBlock(text, tailBlock)) {
    return {
      frozenBlocks: [...frozenBlocks, tailBlock],
      tailBlock: null
    };
  }

  const prev = Array.isArray(prevFrozenBlocks) ? prevFrozenBlocks : [];
  if (prev.length > 0) {
    const lineStarts = collectLineStarts(text);
    const result = protectPrevFrozenBlocks(prev, frozenBlocks, tailBlock, lineStarts, text);
    return result;
  }

  return {
    frozenBlocks,
    tailBlock
  };
}

function protectPrevFrozenBlocks(
  prev: StreamingMarkdownBlock[],
  frozenBlocks: StreamingMarkdownBlock[],
  tailBlock: StreamingMarkdownBlock | null,
  lineStarts: number[],
  text: string
): StreamingBlockPartition {
  let resultFrozen = [...frozenBlocks];
  let resultTail = tailBlock;

  for (const prevBlock of prev) {
    if (!resultTail) break;
    if (prevBlock.endLine <= resultTail.startLine) continue;
    if (prevBlock.startLine >= resultTail.endLine) continue;

    if (prevBlock.startLine >= resultTail.startLine && prevBlock.endLine <= resultTail.endLine) {
      const splitLine = prevBlock.endLine;
      const splitOffset = lineToOffset(lineStarts, splitLine, text.length);
      const tailStartOffset = lineToOffset(lineStarts, resultTail.startLine, text.length);
      const tailEndOffset = lineToOffset(lineStarts, resultTail.endLine, text.length);

      const frontContent = text.slice(tailStartOffset, splitOffset);
      if (frontContent.trim()) {
        resultFrozen.push({
          key: prevBlock.key,
          content: frontContent,
          tokenType: prevBlock.tokenType,
          startLine: resultTail.startLine,
          endLine: splitLine
        });
      }

      const backContent = text.slice(splitOffset, tailEndOffset);
      if (backContent.trim()) {
        resultTail = {
          key: `${splitLine}:${resultTail.endLine}:${resultTail.tokenType}`,
          content: backContent,
          tokenType: resultTail.tokenType,
          startLine: splitLine,
          endLine: resultTail.endLine
        };
      } else {
        resultTail = null;
      }
    }
  }

  return {
    frozenBlocks: resultFrozen,
    tailBlock: resultTail
  };
}
