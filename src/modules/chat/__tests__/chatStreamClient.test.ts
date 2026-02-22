import { parseSseBlock, splitSseFrames } from '../services/chatStreamClient';

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

  it('reports malformed frame parse error', () => {
    const malformed: Array<{ frame: string; reason: string }> = [];
    parseSseBlock(
      'event: message\ndata: {"type":"content.delta","delta":"broken"\n\n',
      () => {},
      {
        onMalformedFrame: (frame, reason) => malformed.push({ frame, reason })
      }
    );
    expect(malformed).toHaveLength(1);
    expect(malformed[0].reason).toBe('json_parse_error');
  });

  it('keeps parsing next frame after one malformed frame', () => {
    const raw = [
      'event: message',
      'data: {"type":"content.delta","delta":"broken"',
      '',
      'event: message',
      'data: {"type":"content.delta","delta":"ok"}',
      '',
      ''
    ].join('\n');

    const { frames } = splitSseFrames(raw);
    const events: Array<Record<string, unknown>> = [];
    const malformed: string[] = [];
    frames.forEach((frame) =>
      parseSseBlock(frame, (event) => events.push(event), {
        onMalformedFrame: (_, reason) => malformed.push(reason)
      })
    );

    expect(malformed).toContain('json_parse_error');
    expect(events).toHaveLength(1);
    expect(events[0].delta).toBe('ok');
  });
});
