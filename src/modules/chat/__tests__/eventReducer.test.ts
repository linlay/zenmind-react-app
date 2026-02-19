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
});
