import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeOrderedListMarkerSpacing,
  preprocessMarkdownContent,
  removeEmptyMarkdownTables,
} from '../../src/shared/markdown/preprocess.ts';

test('markdown preprocess removes empty tables but keeps fenced table text', () => {
  const markdown = [
    'Before',
    '',
    '| Issues |',
    '| --- |',
    '',
    '```md',
    '| Keep |',
    '| --- |',
    '```',
  ].join('\n');

  assert.equal(
    removeEmptyMarkdownTables(markdown),
    ['Before', '', '', '```md', '| Keep |', '| --- |', '```'].join('\n')
  );
});

test('markdown preprocess preserves GFM table and nested list source for native rendering', () => {
  const markdown = [
    'Downloads 目录下共有 **52 个 .md 文件**，分布如下：',
    '',
    '### 直接在 Downloads 根目录（7 个）',
    '| 文件名 |',
    '|--------|',
    '| zenmind 品牌改造.md |',
    '| 所有 prompt 不在源码.md |',
    '',
    '### Downloads/skills-main/（44 个）',
    '- **skills/**:',
    '  - algorithmic-art/SKILL.md',
    '  - brand-guidelines/SKILL.md',
  ].join('\n');

  const processed = preprocessMarkdownContent(markdown);

  assert.equal(processed.includes('| 文件名 |'), true);
  assert.equal(processed.includes('|--------|'), true);
  assert.equal(processed.includes('  - algorithmic-art/SKILL.md'), true);
  assert.equal(processed.includes('  - brand-guidelines/SKILL.md'), true);
});

test('markdown preprocess normalizes ordered list markers outside fenced code', () => {
  const markdown = [
    '用户回答了所有问题：',
    '',
    '1. 工作状态：全职',
    '2. 常用协作工具：钉钉、企业微信',
    '3.每周工作小时数：4小时',
    '4.编程语言：Python',
    '5.工作满意度：1',
    '',
    '```md',
    '3.不要改代码块',
    '```',
  ].join('\n');

  assert.equal(
    normalizeOrderedListMarkerSpacing(markdown),
    [
      '用户回答了所有问题：',
      '',
      '1. 工作状态：全职',
      '2. 常用协作工具：钉钉、企业微信',
      '3. 每周工作小时数：4小时',
      '4. 编程语言：Python',
      '5. 工作满意度：1',
      '',
      '```md',
      '3.不要改代码块',
      '```',
    ].join('\n')
  );
});
