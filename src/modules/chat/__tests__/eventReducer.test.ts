// @ts-nocheck
import { createEmptyChatState, createRuntimeMaps, reduceChatEvent } from '../services/eventReducer';

describe('eventReducer', () => {
  it('handles request -> content -> run.complete flow', () => {
    const runtime = createRuntimeMaps();
    let state = createEmptyChatState();

    state = reduceChatEvent(state, { type: 'request.query', requestId: 'r1', message: 'hi' }, 'live', runtime).next;
    state = reduceChatEvent(state, { type: 'content.start', contentId: 'c1', text: 'hello' }, 'live', runtime).next;
    state = reduceChatEvent(state, { type: 'content.delta', contentId: 'c1', delta: ' world' }, 'live', runtime).next;
    state = reduceChatEvent(state, { type: 'run.complete', runId: 'run-1' }, 'live', runtime).next;

    const user = state.timeline.find((item) => item.kind === 'message' && item.role === 'user');
    const assistant = state.timeline.find((item) => item.kind === 'message' && item.role === 'assistant');
    const end = state.timeline.find((item) => item.kind === 'message' && item.variant === 'run_end');

    expect(user && user.text).toBe('hi');
    expect(assistant && assistant.text).toBe('hello world');
    expect(end && end.text).toBe('本次运行结束');
  });

  it('handles action and tool sequences', () => {
    const runtime = createRuntimeMaps();
    let state = createEmptyChatState();

    state = reduceChatEvent(state, { type: 'action.start', actionId: 'a1', actionName: 'show_modal' }, 'live', runtime).next;
    state = reduceChatEvent(state, { type: 'action.args', actionId: 'a1', delta: '{"title":"ok"}' }, 'live', runtime).next;
    state = reduceChatEvent(state, { type: 'action.end', actionId: 'a1' }, 'live', runtime).next;

    state = reduceChatEvent(state, { type: 'tool.start', toolId: 't1', toolName: 'fetch' }, 'live', runtime).next;
    state = reduceChatEvent(state, { type: 'tool.result', toolId: 't1', result: { ok: true } }, 'live', runtime).next;

    const action = state.timeline.find((item) => item.kind === 'action');
    const tool = state.timeline.find((item) => item.kind === 'tool');

    expect(action && action.state).toBe('done');
    expect(tool && tool.state).toBe('done');
  });

  it('upgrades tool label when toolName arrives later', () => {
    const runtime = createRuntimeMaps();
    let state = createEmptyChatState();

    state = reduceChatEvent(state, { type: 'tool.start', toolId: 't1' }, 'live', runtime).next;
    state = reduceChatEvent(state, { type: 'tool.snapshot', toolId: 't1', toolName: 'fetch_disk' }, 'live', runtime).next;

    const tool = state.timeline.find((item) => item.kind === 'tool');
    expect(tool && tool.label).toBe('fetch_disk');
  });

  it('keeps plan expanded state controlled by UI', () => {
    const runtime = createRuntimeMaps();
    let state = createEmptyChatState();

    state = reduceChatEvent(
      state,
      {
        type: 'plan.update',
        plan: [{ taskId: 't1', description: 'a', status: 'running' }]
      },
      'live',
      runtime
    ).next;
    expect(state.planState.expanded).toBe(false);

    state = {
      ...state,
      planState: {
        ...state.planState,
        expanded: true
      }
    };
    state = reduceChatEvent(
      state,
      {
        type: 'task.end',
        taskId: 't1',
        status: 'done'
      },
      'live',
      runtime
    ).next;
    expect(state.planState.expanded).toBe(true);
  });

  it('task.complete without description preserves original description', () => {
    const runtime = createRuntimeMaps();
    let state = createEmptyChatState();

    // plan.update 设置初始任务描述
    state = reduceChatEvent(
      state,
      {
        type: 'plan.update',
        plan: [
          { taskId: 'abc123', description: '执行数据库迁移', status: 'init' }
        ]
      },
      'live',
      runtime
    ).next;
    expect(state.planState.tasks[0].description).toBe('执行数据库迁移');

    // task.start 携带 description，应更新
    state = reduceChatEvent(
      state,
      {
        type: 'task.start',
        taskId: 'abc123',
        description: '正在执行数据库迁移'
      },
      'live',
      runtime
    ).next;
    expect(state.planState.tasks[0].description).toBe('正在执行数据库迁移');
    expect(state.planState.tasks[0].status).toBe('running');

    // task.complete 不携带 description，应保留原有描述
    state = reduceChatEvent(
      state,
      {
        type: 'task.complete',
        taskId: 'abc123'
      },
      'live',
      runtime
    ).next;
    expect(state.planState.tasks[0].description).toBe('正在执行数据库迁移');
    expect(state.planState.tasks[0].status).toBe('done');
  });

  it('task event for unknown taskId appends new task with taskId as description', () => {
    const runtime = createRuntimeMaps();
    let state = createEmptyChatState();

    // task.start 引用不存在的 taskId，应追加新任务
    state = reduceChatEvent(
      state,
      {
        type: 'task.start',
        taskId: 'new-task-1'
      },
      'live',
      runtime
    ).next;
    expect(state.planState.tasks).toHaveLength(1);
    expect(state.planState.tasks[0].taskId).toBe('new-task-1');
    expect(state.planState.tasks[0].description).toBe('new-task-1');
    expect(state.planState.tasks[0].status).toBe('running');
  });

  it('emits frontend_tool_params_ready on tool.end with valid strict JSON args', () => {
    const runtime = createRuntimeMaps();
    let state = createEmptyChatState();

    const start = reduceChatEvent(
      state,
      { type: 'tool.start', toolId: 't1', runId: 'run-1', toolType: 'html', toolKey: 'confirm_dialog' },
      'live',
      runtime
    );
    state = start.next;
    expect(start.effects.some((effect) => effect.type === 'activate_frontend_tool')).toBe(true);

    state = reduceChatEvent(
      state,
      {
        type: 'tool.args',
        toolId: 't1',
        delta: '{"question":"Q","options":["A","B"],"allowFreeText":false}'
      },
      'live',
      runtime
    ).next;

    const end = reduceChatEvent(state, { type: 'tool.end', toolId: 't1' }, 'live', runtime);
    const effect = end.effects.find((item) => item.type === 'frontend_tool_params_ready');
    expect(effect).toBeTruthy();
    expect(effect?.payload?.paramsReady).toBe(true);
    expect(effect?.payload?.paramsError).toBe('');
    expect(effect?.payload?.toolParams).toEqual({
      question: 'Q',
      options: ['A', 'B'],
      allowFreeText: false
    });
  });

  it('emits parse error when tool.end args are not strict JSON', () => {
    const runtime = createRuntimeMaps();
    let state = createEmptyChatState();

    state = reduceChatEvent(
      state,
      { type: 'tool.start', toolId: 't2', runId: 'run-2', toolType: 'html', toolKey: 'confirm_dialog' },
      'live',
      runtime
    ).next;

    state = reduceChatEvent(
      state,
      { type: 'tool.args', toolId: 't2', delta: '{"question":"Q"' },
      'live',
      runtime
    ).next;

    const end = reduceChatEvent(state, { type: 'tool.end', toolId: 't2' }, 'live', runtime);
    const effect = end.effects.find((item) => item.type === 'frontend_tool_params_ready');
    expect(effect).toBeTruthy();
    expect(effect?.payload?.paramsReady).toBe(false);
    expect(effect?.payload?.paramsError).toContain('严格 JSON');
    expect(effect?.payload?.toolParams).toBeUndefined();
  });

  it('uses tool.params payload as final params on tool.end', () => {
    const runtime = createRuntimeMaps();
    let state = createEmptyChatState();

    state = reduceChatEvent(
      state,
      { type: 'tool.start', toolId: 't3', runId: 'run-3', toolType: 'html', toolKey: 'confirm_dialog' },
      'live',
      runtime
    ).next;

    state = reduceChatEvent(
      state,
      {
        type: 'tool.params',
        toolId: 't3',
        toolParams: { question: 'P', options: ['X', 'Y'] }
      },
      'live',
      runtime
    ).next;

    const end = reduceChatEvent(state, { type: 'tool.end', toolId: 't3' }, 'live', runtime);
    const effect = end.effects.find((item) => item.type === 'frontend_tool_params_ready');
    expect(effect?.payload?.paramsReady).toBe(true);
    expect(effect?.payload?.paramsError).toBe('');
    expect(effect?.payload?.toolParams).toEqual({ question: 'P', options: ['X', 'Y'] });
  });

  it('does not emit frontend_tool_params_ready for non-frontend tools', () => {
    const runtime = createRuntimeMaps();
    let state = createEmptyChatState();

    state = reduceChatEvent(
      state,
      { type: 'tool.start', toolId: 't4', runId: 'run-4', toolType: 'shell', toolKey: 'file.read' },
      'live',
      runtime
    ).next;
    state = reduceChatEvent(state, { type: 'tool.args', toolId: 't4', delta: '{"path":"a"}' }, 'live', runtime).next;
    const end = reduceChatEvent(state, { type: 'tool.end', toolId: 't4' }, 'live', runtime);
    expect(end.effects.some((item) => item.type === 'frontend_tool_params_ready')).toBe(false);
  });

  it('assembles tool.args by chunkIndex in order and parses on tool.end', () => {
    const runtime = createRuntimeMaps();
    let state = createEmptyChatState();

    state = reduceChatEvent(
      state,
      { type: 'tool.start', toolId: 'tc1', runId: 'run-c1', toolType: 'html', toolKey: 'confirm_dialog' },
      'live',
      runtime
    ).next;

    state = reduceChatEvent(
      state,
      { type: 'tool.args', toolId: 'tc1', chunkIndex: 0, delta: '{"question":"Q","options":' },
      'live',
      runtime
    ).next;
    state = reduceChatEvent(
      state,
      { type: 'tool.args', toolId: 'tc1', chunkIndex: 1, delta: '["A","B"],"allowFreeText":false}' },
      'live',
      runtime
    ).next;

    const end = reduceChatEvent(state, { type: 'tool.end', toolId: 'tc1' }, 'live', runtime);
    const effect = end.effects.find((item) => item.type === 'frontend_tool_params_ready');
    expect(effect?.payload?.paramsReady).toBe(true);
    expect(effect?.payload?.toolParams).toEqual({
      question: 'Q',
      options: ['A', 'B'],
      allowFreeText: false
    });
    const tool = end.next.timeline.find((item) => item.kind === 'tool');
    expect(tool?.argsText).toBe('{"question":"Q","options":["A","B"],"allowFreeText":false}');
  });

  it('assembles tool.args correctly when chunkIndex arrives out of order', () => {
    const runtime = createRuntimeMaps();
    let state = createEmptyChatState();

    state = reduceChatEvent(
      state,
      { type: 'tool.start', toolId: 'tc2', runId: 'run-c2', toolType: 'html', toolKey: 'confirm_dialog' },
      'live',
      runtime
    ).next;

    state = reduceChatEvent(
      state,
      { type: 'tool.args', toolId: 'tc2', chunkIndex: 1, delta: '世界"}' },
      'live',
      runtime
    ).next;
    state = reduceChatEvent(
      state,
      { type: 'tool.args', toolId: 'tc2', chunkIndex: 0, delta: '{"question":"你好' },
      'live',
      runtime
    ).next;

    const end = reduceChatEvent(state, { type: 'tool.end', toolId: 'tc2' }, 'live', runtime);
    const effect = end.effects.find((item) => item.type === 'frontend_tool_params_ready');
    expect(effect?.payload?.paramsReady).toBe(true);
    expect(effect?.payload?.toolParams).toEqual({ question: '你好世界' });
    expect(effect?.payload?.chunkGapDetected).toBe(false);
  });

  it('detects missing chunkIndex and blocks strict parse on tool.end', () => {
    const runtime = createRuntimeMaps();
    let state = createEmptyChatState();

    state = reduceChatEvent(
      state,
      { type: 'tool.start', toolId: 'tc3', runId: 'run-c3', toolType: 'html', toolKey: 'confirm_dialog' },
      'live',
      runtime
    ).next;
    state = reduceChatEvent(
      state,
      { type: 'tool.args', toolId: 'tc3', chunkIndex: 1, delta: '{"question":"missing-zero"}' },
      'live',
      runtime
    ).next;

    const end = reduceChatEvent(state, { type: 'tool.end', toolId: 'tc3' }, 'live', runtime);
    const effect = end.effects.find((item) => item.type === 'frontend_tool_params_ready');
    expect(effect).toBeTruthy();
    expect(effect?.payload?.paramsReady).toBe(false);
    expect(effect?.payload?.paramsError).toContain('missing chunks: 0');
    expect(effect?.payload?.chunkGapDetected).toBe(true);
    expect(effect?.payload?.missingChunkIndexes).toEqual([0]);
  });

  it('keeps params submit-ready when tool.params exists even if args chunks are missing', () => {
    const runtime = createRuntimeMaps();
    let state = createEmptyChatState();

    state = reduceChatEvent(
      state,
      { type: 'tool.start', toolId: 'tc3b', runId: 'run-c3b', toolType: 'html', toolKey: 'confirm_dialog' },
      'live',
      runtime
    ).next;
    state = reduceChatEvent(
      state,
      {
        type: 'tool.params',
        toolId: 'tc3b',
        toolParams: { question: 'Q', options: ['A', 'B'], allowFreeText: false }
      },
      'live',
      runtime
    ).next;
    state = reduceChatEvent(
      state,
      { type: 'tool.args', toolId: 'tc3b', chunkIndex: 1, delta: '{"question":"missing-zero"}' },
      'live',
      runtime
    ).next;

    const end = reduceChatEvent(state, { type: 'tool.end', toolId: 'tc3b' }, 'live', runtime);
    const effect = end.effects.find((item) => item.type === 'frontend_tool_params_ready');
    expect(effect).toBeTruthy();
    expect(effect?.payload?.paramsReady).toBe(true);
    expect(effect?.payload?.paramsError).toBe('');
    expect(effect?.payload?.chunkGapDetected).toBe(true);
    expect(effect?.payload?.toolParams).toEqual({
      question: 'Q',
      options: ['A', 'B'],
      allowFreeText: false
    });
  });

  it('uses runtime argsBuffer as source of truth for tool.end argsText', () => {
    const runtime = createRuntimeMaps();
    let state = createEmptyChatState();

    state = reduceChatEvent(
      state,
      { type: 'tool.start', toolId: 'tc4', runId: 'run-c4', toolType: 'html', toolKey: 'confirm_dialog' },
      'live',
      runtime
    ).next;
    state = reduceChatEvent(
      state,
      { type: 'tool.args', toolId: 'tc4', chunkIndex: 1, delta: 'B"}' },
      'live',
      runtime
    ).next;
    state = reduceChatEvent(
      state,
      { type: 'tool.args', toolId: 'tc4', chunkIndex: 0, delta: '{"question":"A' },
      'live',
      runtime
    ).next;

    const end = reduceChatEvent(state, { type: 'tool.end', toolId: 'tc4' }, 'live', runtime);
    const tool = end.next.timeline.find((item) => item.kind === 'tool');
    expect(tool?.argsText).toBe('{"question":"AB"}');
    const effect = end.effects.find((item) => item.type === 'frontend_tool_params_ready');
    expect(effect?.payload?.argsText).toBe('{"question":"AB"}');
  });
});
