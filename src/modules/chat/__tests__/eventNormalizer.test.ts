import { getPlanProgress, normalizeEventType, normalizeTaskStatus, parseStructuredArgs } from '../services/eventNormalizer';

describe('eventNormalizer', () => {
  it('normalizes task status', () => {
    expect(normalizeTaskStatus('in_progress')).toBe('running');
    expect(normalizeTaskStatus('completed')).toBe('done');
    expect(normalizeTaskStatus('error')).toBe('failed');
  });

  it('normalizes alias event types', () => {
    expect(normalizeEventType('message.delta')).toBe('content.delta');
  });

  it('parses structured args', () => {
    expect(parseStructuredArgs('{"foo":1}')).toEqual({ foo: 1 });
    expect(parseStructuredArgs('not json')).toBeNull();
  });

  it('calculates plan progress', () => {
    expect(
      getPlanProgress([
        { taskId: 't1', description: 'a', status: 'done' },
        { taskId: 't2', description: 'b', status: 'running' }
      ])
    ).toEqual({ current: 2, total: 2 });
  });
});
