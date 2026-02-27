import { formatChatListTime, getChatAgentKey, getChatAgentName, getChatLastContent, getChatTimestamp, getChatTitle } from '../format';

describe('chat format helpers', () => {
  it('uses chatName first and falls back to title/chatId', () => {
    expect(getChatTitle({ chatName: '会话名', title: '会话标题', chatId: 'chat-1' })).toBe('会话名');
    expect(getChatTitle({ chatName: '   ', title: '会话标题', chatId: 'chat-2' })).toBe('会话标题');
    expect(getChatTitle({ chatName: '', title: '', chatId: 'chat-3' })).toBe('chat-3');
  });

  it('resolves agent name with fallback order', () => {
    expect(getChatAgentName({ firstAgentName: '示例智能体', firstAgentKey: 'agent-key' })).toBe('示例智能体');
    expect(getChatAgentName({ firstAgentName: '   ', agentName: '备用智能体', firstAgentKey: 'agent-key' })).toBe('备用智能体');
    expect(getChatAgentName({ firstAgentName: '', firstAgentKey: '' })).toBe('未知智能体');
  });

  it('resolves agent key with fallback order', () => {
    expect(getChatAgentKey({ firstAgentKey: 'agent-a', agentKey: 'agent-b' })).toBe('agent-a');
    expect(getChatAgentKey({ firstAgentKey: '', agentKey: 'agent-b' })).toBe('agent-b');
    expect(getChatAgentKey({ firstAgentKey: '', agentKey: '' })).toBe('');
  });

  it('resolves last content with fallback order', () => {
    expect(getChatLastContent({ lastRunContent: '最新结果', last: '旧结果' } as any)).toBe('最新结果');
    expect(getChatLastContent({ lastRunContent: '', last: '旧结果' } as any)).toBe('旧结果');
    expect(getChatLastContent({} as any)).toBe('');
  });

  it('formats chat list time as hh:mm for today', () => {
    const now = new Date(2026, 1, 22, 15, 30, 0);
    const chatTime = new Date(2026, 1, 22, 8, 5, 0);
    expect(formatChatListTime({ updatedAt: chatTime.getTime() }, now)).toBe('08:05');
  });

  it('formats chat list time as MM-DD within current year', () => {
    const now = new Date(2026, 1, 22, 15, 30, 0);
    const chatTime = new Date(2026, 0, 3, 11, 20, 0);
    expect(formatChatListTime({ updatedAt: chatTime.getTime() }, now)).toBe('01-03');
  });

  it('formats chat list time as YYYY-MM-DD across years', () => {
    const now = new Date(2026, 1, 22, 15, 30, 0);
    const chatTime = new Date(2025, 11, 31, 23, 59, 0);
    expect(formatChatListTime({ updatedAt: chatTime.getTime() }, now)).toBe('2025-12-31');
  });

  it('returns placeholder when updatedAt is invalid', () => {
    expect(formatChatListTime({ updatedAt: 'not-a-date' })).toBe('--');
    expect(formatChatListTime({ createdAt: new Date(2026, 1, 20, 9, 0, 0).getTime() })).toBe('--');
  });

  it('uses updatedAt first and then createdAt for timestamp', () => {
    const updatedAt = new Date(2026, 1, 20, 9, 0, 0).getTime();
    const createdAt = new Date(2026, 1, 21, 9, 0, 0).getTime();
    expect(getChatTimestamp({ updatedAt, createdAt })).toBe(updatedAt);
    expect(getChatTimestamp({ createdAt })).toBe(createdAt);
  });
});
