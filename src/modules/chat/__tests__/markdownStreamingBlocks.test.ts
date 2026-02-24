import { partitionStreamingBlocks, splitStreamingMarkdownBlocks } from '../utils/markdownStreamingBlocks';

describe('markdownStreamingBlocks', () => {
  it('splits markdown into renderable leaf blocks and keeps list items independent', () => {
    const text = [
      '段落1',
      '',
      '- a',
      '- b',
      '',
      '> q1',
      '> q2',
      '',
      '```ts',
      'const x = 1;',
      '```',
      '',
      '|a|b|',
      '|-|-|',
      '|1|2|'
    ].join('\n');

    const blocks = splitStreamingMarkdownBlocks(text);

    expect(blocks.length).toBe(6);
    expect(blocks[0].tokenType).toBe('paragraph_open');
    expect(blocks[0].content).toContain('段落1');

    const listItemBlocks = blocks.filter((block) => block.tokenType === 'paragraph_open' && /-\s+[ab]/.test(block.content));
    expect(listItemBlocks.length).toBe(2);
    expect(listItemBlocks[0].content).toContain('- a');
    expect(listItemBlocks[1].content).toContain('- b');

    const quoteBlock = blocks.find((block) => block.tokenType === 'paragraph_open' && block.content.includes('> q1'));
    expect(quoteBlock?.content).toContain('> q2');

    const fenceBlock = blocks.find((block) => block.tokenType === 'fence');
    expect(fenceBlock?.content).toContain('```ts');
    expect(fenceBlock?.content).toContain('const x = 1;');

    const tableBlock = blocks.find((block) => block.tokenType === 'table_open');
    expect(tableBlock?.content).toContain('|a|b|');

    expect(blocks.some((block) => block.tokenType === 'bullet_list_open')).toBe(false);
  });

  it('early-freezes tail block when text ends with a blank line', () => {
    const text = '第一段\n\n第二段\n\n';
    const result = partitionStreamingBlocks(text);

    expect(result.tailBlock).toBeNull();
    expect(result.frozenBlocks.length).toBe(2);
    expect(result.frozenBlocks[1].content).toContain('第二段');
  });

  it('early-freezes fence tail when explicit closing fence exists', () => {
    const text = ['```js', 'console.log(1);', '```'].join('\n');
    const result = partitionStreamingBlocks(text);

    expect(result.tailBlock).toBeNull();
    expect(result.frozenBlocks.length).toBe(1);
    expect(result.frozenBlocks[0].tokenType).toBe('fence');
  });

  it('keeps unclosed fence as tail block', () => {
    const text = ['```js', 'console.log(1);'].join('\n');
    const result = partitionStreamingBlocks(text);

    expect(result.frozenBlocks.length).toBe(0);
    expect(result.tailBlock).not.toBeNull();
    expect(result.tailBlock?.tokenType).toBe('fence');
  });

  it('early-freezes image paragraph tail with a single trailing newline', () => {
    const text = '![示例](/data/sample_photo.jpg)\n';
    const result = partitionStreamingBlocks(text);

    expect(result.tailBlock).toBeNull();
    expect(result.frozenBlocks.length).toBe(1);
    expect(result.frozenBlocks[0].tokenType).toBe('paragraph_open');
  });

  it('keeps image paragraph as tail without trailing newline', () => {
    const text = '![示例](/data/sample_photo.jpg)';
    const result = partitionStreamingBlocks(text);

    expect(result.frozenBlocks.length).toBe(0);
    expect(result.tailBlock).not.toBeNull();
    expect(result.tailBlock?.tokenType).toBe('paragraph_open');
  });

  it('does not early-freeze malformed image markdown on single newline', () => {
    const text = '![示例](/data/sample_photo.jpg\n';
    const result = partitionStreamingBlocks(text);

    expect(result.frozenBlocks.length).toBe(0);
    expect(result.tailBlock).not.toBeNull();
    expect(result.tailBlock?.tokenType).toBe('paragraph_open');
  });

  it('protects previously frozen image block when merged into tail by subsequent text without blank line', () => {
    const textBefore = '![示例](/data/sample_photo.jpg)\n';
    const resultBefore = partitionStreamingBlocks(textBefore);
    expect(resultBefore.frozenBlocks.length).toBe(1);
    expect(resultBefore.tailBlock).toBeNull();

    const textAfter = '![示例](/data/sample_photo.jpg)\n这是一张示例图片';
    const resultAfter = partitionStreamingBlocks(textAfter, resultBefore.frozenBlocks);

    expect(resultAfter.frozenBlocks.length).toBeGreaterThanOrEqual(1);
    const imageBlock = resultAfter.frozenBlocks.find((b) => b.content.includes('![示例]'));
    expect(imageBlock).toBeTruthy();
    expect(imageBlock?.key).toBe(resultBefore.frozenBlocks[0].key);

    if (resultAfter.tailBlock) {
      expect(resultAfter.tailBlock.content).not.toContain('![示例]');
      expect(resultAfter.tailBlock.content).toContain('这是一张');
    }
  });

  it('behaves identically when prevFrozenBlocks is empty', () => {
    const text = '第一段\n\n第二段';
    const withoutPrev = partitionStreamingBlocks(text);
    const withEmptyPrev = partitionStreamingBlocks(text, []);

    expect(withoutPrev.frozenBlocks.length).toBe(withEmptyPrev.frozenBlocks.length);
    expect(withoutPrev.tailBlock?.key).toBe(withEmptyPrev.tailBlock?.key);
  });

  it('protects multiple previously frozen blocks when later text merges them', () => {
    const text1 = '# 标题\n\n![图片](/data/img.png)\n';
    const r1 = partitionStreamingBlocks(text1);
    expect(r1.frozenBlocks.length).toBe(2);

    const text2 = '# 标题\n\n![图片](/data/img.png)\n后续文字';
    const r2 = partitionStreamingBlocks(text2, r1.frozenBlocks);

    expect(r2.frozenBlocks.length).toBeGreaterThanOrEqual(2);
    const headingBlock = r2.frozenBlocks.find((b) => b.content.includes('# 标题'));
    expect(headingBlock).toBeTruthy();
    const imageBlock = r2.frozenBlocks.find((b) => b.content.includes('![图片]'));
    expect(imageBlock).toBeTruthy();
  });
});
