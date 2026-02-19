import { parseSseBlock } from '../services/chatStreamClient';

describe('parseSseBlock', () => {
  it('parses json data payload', () => {
    const events: Array<Record<string, unknown>> = [];
    parseSseBlock('event: message\ndata: {"type":"content.delta","delta":"hello"}\n\n', (event) => {
      events.push(event);
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('content.delta');
  });

  it('ignores done payload', () => {
    const events: Array<Record<string, unknown>> = [];
    parseSseBlock('data: [DONE]\n\n', (event) => events.push(event));
    expect(events).toHaveLength(0);
  });
});
