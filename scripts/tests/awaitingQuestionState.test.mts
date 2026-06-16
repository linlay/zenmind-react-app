import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildQuestionSubmitParams,
  createAwaitingQuestionDrafts,
  findAwaitingAnswerError,
  formatAwaitingDateAnswer,
  getAwaitingCountdownRemainingSeconds,
  getAwaitingQuestionsSignature,
  isValidAwaitingDateAnswer,
  parseAwaitingDateAnswer,
  reconcileAwaitingQuestionDrafts,
  resolveAwaitingCountdownDeadline,
  setFreeTextAnswer,
  shouldAutoAdvanceAwaitingQuestion,
  toggleSelectAnswer
} from '../../src/features/chatPersistence/components/awaiting/awaitingQuestionState.ts';
import { buildAwaitingSubmitPayload } from '../../src/features/chatPersistence/components/awaiting/awaitingSubmitState.ts';
import type { ChatTimelineAwaitingQuestion, ChatTimelineAwaitingState } from '../../src/features/chatTimeline/index.ts';

const questions: ChatTimelineAwaitingQuestion[] = [
  {
    id: 'q1',
    type: 'select',
    question: '岗位类型？',
    options: [{ label: 'engineering 工程部' }, { label: 'finance 财务部' }]
  },
  {
    id: 'q2',
    type: 'multi-select',
    question: '擅长哪些技能？',
    options: [{ label: '数据分析' }, { label: '项目管理' }]
  },
  {
    id: 'q3',
    type: 'date',
    question: '入职日期？',
    placeholder: 'YYYY-MM-DD'
  },
  {
    id: 'q4',
    type: 'select',
    question: '沟通方式？',
    allowFreeText: true,
    freeTextPlaceholder: '请输入其他沟通方式',
    options: [{ label: 'email 邮件' }, { label: 'chat 即时通讯' }]
  },
  {
    id: 'q5',
    type: 'number',
    question: '工作年限？',
    placeholder: '请输入数字'
  }
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
    { id: 'q5', answer: 7 }
  ]);
});

test('awaiting question state builds current question reject payload', () => {
  const awaiting: ChatTimelineAwaitingState = {
    id: 'awaiting-node-1',
    awaitingId: 'awaiting-1',
    runId: 'run-1',
    createdAt: 1,
    updatedAt: 1,
    prompt: '',
    answer: '',
    payloadText: '',
    mode: 'question',
    status: 'ask',
    interactive: {
      kind: 'question',
      viewportType: 'builtin',
      viewportKey: 'question',
      timeout: null,
      agentKey: 'askUser.demo',
      questions,
    },
  };

  assert.deepEqual(
    buildAwaitingSubmitPayload(awaiting, {
      kind: 'question-reject',
      questionId: questions[1].id,
    }),
    {
      runId: 'run-1',
      awaitingId: 'awaiting-1',
      params: [{ id: 'q2', decision: 'reject' }]
    }
  );
});

test('awaiting question state resolves countdown deadline for live and restored awaiting', () => {
  const liveDeadline = resolveAwaitingCountdownDeadline({
    createdAt: 1_000,
    timeout: 120_000,
    displayedAt: 30_000
  });
  assert.equal(liveDeadline, 121_000);
  assert.equal(getAwaitingCountdownRemainingSeconds(liveDeadline, 30_000), 91);

  const restoredDeadline = resolveAwaitingCountdownDeadline({
    createdAt: 1_000,
    timeout: 120_000,
    displayedAt: 200_000
  });
  assert.equal(restoredDeadline, 320_000);
  assert.equal(getAwaitingCountdownRemainingSeconds(restoredDeadline, 200_000), 120);
  assert.equal(resolveAwaitingCountdownDeadline({ createdAt: 1_000, timeout: null, displayedAt: 200_000 }), null);
});

test('awaiting question state reports the first invalid answer', () => {
  const drafts = createAwaitingQuestionDrafts(questions);
  drafts[0] = { id: 'q1', answer: 'finance 财务部' };

  assert.deepEqual(findAwaitingAnswerError(questions, drafts), {
    index: 1,
    message: '请至少选择一项'
  });

  drafts[1] = { id: 'q2', answers: ['数据分析'] };
  drafts[2] = { id: 'q3', answer: '2026-02-31' };

  assert.deepEqual(findAwaitingAnswerError(questions, drafts), {
    index: 2,
    message: '请输入 YYYY-MM-DD 格式的日期'
  });
});

test('awaiting question state parses and formats date answers', () => {
  const dateQuestion = questions[2];
  const datetimeQuestion: ChatTimelineAwaitingQuestion = {
    id: 'q6',
    type: 'datetime',
    question: '截止时间？'
  };

  const date = parseAwaitingDateAnswer(dateQuestion, '2026-06-05');
  assert.equal(date?.getFullYear(), 2026);
  assert.equal(date?.getMonth(), 5);
  assert.equal(date?.getDate(), 5);
  assert.equal(formatAwaitingDateAnswer(dateQuestion, new Date(2026, 5, 5, 14, 30, 20)), '2026-06-05');

  const datetime = parseAwaitingDateAnswer(datetimeQuestion, '2026-06-05 09:08:07');
  assert.equal(datetime?.getHours(), 9);
  assert.equal(datetime?.getMinutes(), 8);
  assert.equal(datetime?.getSeconds(), 7);
  assert.equal(formatAwaitingDateAnswer(datetimeQuestion, new Date(2026, 5, 5, 9, 8, 7)), '2026-06-05 09:08:07');

  assert.equal(parseAwaitingDateAnswer(dateQuestion, '2026-02-31'), null);
  assert.equal(parseAwaitingDateAnswer(datetimeQuestion, '2026-06-05 24:00:00'), null);
  assert.equal(isValidAwaitingDateAnswer(datetimeQuestion, '2026-06-05 23:59:59'), true);
});

test('awaiting question state keeps drafts for repeated equivalent question payloads', () => {
  const drafts = createAwaitingQuestionDrafts(questions);
  drafts[0] = { id: 'q1', answer: 'engineering 工程部' };
  drafts[1] = { id: 'q2', answers: ['数据分析'] };

  const repeatedQuestions = questions.map((question) => ({
    ...question,
    options: question.options?.map((option) => ({ ...option }))
  }));

  assert.equal(getAwaitingQuestionsSignature(repeatedQuestions), getAwaitingQuestionsSignature(questions));
  assert.equal(reconcileAwaitingQuestionDrafts(repeatedQuestions, drafts), drafts);
});

test('awaiting question state reconciles drafts by id when question shape changes', () => {
  const drafts = createAwaitingQuestionDrafts(questions);
  drafts[1] = { id: 'q2', answers: ['项目管理'] };

  const nextQuestions = [questions[1], { ...questions[0], id: 'q1b' }];
  assert.deepEqual(reconcileAwaitingQuestionDrafts(nextQuestions, drafts), [
    { id: 'q2', answers: ['项目管理'] },
    { id: 'q1b' }
  ]);
});

test('awaiting question state only auto-advances ordinary single select options', () => {
  assert.equal(shouldAutoAdvanceAwaitingQuestion(questions[0]), true);
  assert.equal(shouldAutoAdvanceAwaitingQuestion(questions[1]), false);
  assert.equal(shouldAutoAdvanceAwaitingQuestion(questions[2]), false);
});
