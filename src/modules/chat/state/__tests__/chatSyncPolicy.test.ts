import { shouldApplyChatSyncResult } from '../chatSyncPolicy';

describe('chatSyncPolicy', () => {
  it('skips chat updates when incremental sync reports no updated chats', () => {
    expect(shouldApplyChatSyncResult([])).toBe(false);
  });

  it('applies chat updates when incremental sync reports updated chats', () => {
    expect(shouldApplyChatSyncResult(['chat-1'])).toBe(true);
  });
});
