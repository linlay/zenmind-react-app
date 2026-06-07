import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildQuestionSubmitParams,
  createAwaitingQuestionDrafts,
  findAwaitingAnswerError,
  getAwaitingQuestionsSignature,
  reconcileAwaitingQuestionDrafts,
  setFreeTextAnswer,
  shouldAutoAdvanceAwaitingQuestion,
  toggleSelectAnswer,
} from '../../src/features/chatPersistence/components/awaiting/awaitingQuestionState.ts';
import type { ChatTimelineAwaitingQuestion } from '../../src/features/chatTimeline/index.ts';

const questions: ChatTimelineAwaitingQuestion[] = [
  {
    id: 'q1',
    type: 'select',
    question: '岗位类型？',
    options: [{ label: 'engineering 工程部' }, { label: 'finance 财务部' }],
  },
  {
    id: 'q2',
    type: 'multi-select',
    question: '擅长哪些技能？',
    options: [{ label: '数据分析' }, { label: '项目管理' }],
  },
  {
    id: 'q3',
    type: 'date',
    question: '入职日期？',
    placeholder: 'YYYY-MM-DD',
  },
  {
    id: 'q4',
    type: 'select',
    question: '沟通方式？',
    allowFreeText: true,
    freeTextPlaceholder: '请输入其他沟通方式',
    options: [{ label: 'email 邮件' }, { label: 'chat 即时通讯' }],
  },
  {
    id: 'q5',
    type: 'number',
    question: '工作年限？',
    placeholder: '请输入数字',
  },
];

test('awaiting question state builds compact submit params', () => {
  let drafts = createAwaitingQuestionDrafts(questions);
  drafts[0] = toggleSelectAnswer(questions[0], drafts[0], 'engineering 工程部');
  drafts[1] = toggleSelectAnswer(questions[1], drafts[1], '数据分析');
  drafts[1] = toggleSelectAnswer(questions[1], drafts[1], '项目管理');
  drafts[2] = { id: 'q3', answer: '2026-06-05' };
  drafts[3] = setFreeTextAnswer(questions[3], drafts[3], '飞书');
  drafts[4] = { id: 'q5', answer: '7' };

  assert.equal(findAwaitingAnswerError(questions, drafts), null);
  assert.deepEqual(buildQuestionSubmitParams(questions, drafts), [
    { id: 'q1', answer: 'engineering 工程部' },
    { id: 'q2', answers: ['数据分析', '项目管理'] },
    { id: 'q3', answer: '2026-06-05' },
    { id: 'q4', answer: '飞书' },
    { id: 'q5', answer: 7 },
  ]);
});

test('awaiting question state reports the first invalid answer', () => {
  const drafts = createAwaitingQuestionDrafts(questions);
  drafts[0] = { id: 'q1', answer: 'finance 财务部' };

  assert.deepEqual(findAwaitingAnswerError(questions, drafts), {
    index: 1,
    message: '请至少选择一项',
  });

  drafts[1] = { id: 'q2', answers: ['数据分析'] };
  drafts[2] = { id: 'q3', answer: '2026-02-31' };

  assert.deepEqual(findAwaitingAnswerError(questions, drafts), {
    index: 2,
    message: '请输入 YYYY-MM-DD 格式的日期',
  });
});

test('awaiting question state keeps drafts for repeated equivalent question payloads', () => {
  const drafts = createAwaitingQuestionDrafts(questions);
  drafts[0] = { id: 'q1', answer: 'engineering 工程部' };
  drafts[1] = { id: 'q2', answers: ['数据分析'] };

  const repeatedQuestions = questions.map((question) => ({
    ...question,
    options: question.options?.map((option) => ({ ...option })),
  }));

  assert.equal(
    getAwaitingQuestionsSignature(repeatedQuestions),
    getAwaitingQuestionsSignature(questions)
  );
  assert.equal(reconcileAwaitingQuestionDrafts(repeatedQuestions, drafts), drafts);
});

test('awaiting question state reconciles drafts by id when question shape changes', () => {
  const drafts = createAwaitingQuestionDrafts(questions);
  drafts[1] = { id: 'q2', answers: ['项目管理'] };

  const nextQuestions = [questions[1], { ...questions[0], id: 'q1b' }];
  assert.deepEqual(reconcileAwaitingQuestionDrafts(nextQuestions, drafts), [
    { id: 'q2', answers: ['项目管理'] },
    { id: 'q1b' },
  ]);
});

test('awaiting question state only auto-advances ordinary single select options', () => {
  assert.equal(shouldAutoAdvanceAwaitingQuestion(questions[0]), true);
  assert.equal(shouldAutoAdvanceAwaitingQuestion(questions[1]), false);
  assert.equal(shouldAutoAdvanceAwaitingQuestion(questions[2]), false);
});
