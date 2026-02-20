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
});
