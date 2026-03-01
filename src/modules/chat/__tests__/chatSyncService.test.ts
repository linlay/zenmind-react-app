const mockFetchApiJson = jest.fn();
const mockGetMaxLastRunId = jest.fn();
const mockListCachedChats = jest.fn();
const mockUpsertChatDetail = jest.fn();
const mockUpsertChatSummaries = jest.fn();

jest.mock('../../../core/network/apiClient', () => ({
  fetchApiJson: (...args: any[]) => mockFetchApiJson(...args)
}));

jest.mock('../services/chatCacheDb', () => ({
  getMaxLastRunId: (...args: any[]) => mockGetMaxLastRunId(...args),
  listCachedChats: (...args: any[]) => mockListCachedChats(...args),
  upsertChatDetail: (...args: any[]) => mockUpsertChatDetail(...args),
  upsertChatSummaries: (...args: any[]) => mockUpsertChatSummaries(...args)
}));

const { fetchAndCacheChatDetail, syncChatsIncremental } = require('../services/chatSyncService');

describe('chatSyncService', () => {
  beforeEach(() => {
    mockFetchApiJson.mockReset();
    mockGetMaxLastRunId.mockReset();
    mockListCachedChats.mockReset();
    mockUpsertChatDetail.mockReset();
    mockUpsertChatSummaries.mockReset();
  });

  it('requests incremental chats with lastRunId and fetches detail one by one', async () => {
    mockGetMaxLastRunId.mockResolvedValue('0010');
    mockFetchApiJson
      .mockResolvedValueOnce([
        {
          chatId: 'chat-1',
          chatName: '会话一',
          firstAgentKey: 'agent-a',
          lastRunId: '0011'
        },
        {
          chatId: 'chat-2',
          chatName: '会话二',
          firstAgentKey: 'agent-b',
          lastRunId: '0012'
        }
      ])
      .mockResolvedValueOnce({ chatId: 'chat-1', chatName: '会话一', chatImageToken: 'tk-1', events: [{ type: 'a' }] })
      .mockResolvedValueOnce({ chatId: 'chat-2', chatName: '会话二', chatImageToken: 'tk-2', events: [{ type: 'b' }] });

    mockListCachedChats.mockResolvedValue([
      { chatId: 'chat-2', lastRunId: '0012' },
      { chatId: 'chat-1', lastRunId: '0011' }
    ]);

    const result = await syncChatsIncremental('https://api.example.com');

    expect(mockFetchApiJson).toHaveBeenNthCalledWith(
      1,
      'https://api.example.com',
      '/api/ap/chats?lastRunId=0010'
    );
    expect(mockFetchApiJson).toHaveBeenNthCalledWith(
      2,
      'https://api.example.com',
      '/api/ap/chat?chatId=chat-1'
    );
    expect(mockFetchApiJson).toHaveBeenNthCalledWith(
      3,
      'https://api.example.com',
      '/api/ap/chat?chatId=chat-2'
    );

    expect(mockUpsertChatSummaries).toHaveBeenCalledTimes(1);
    expect(mockUpsertChatDetail).toHaveBeenCalledTimes(2);
    expect(result.updatedChatIds).toEqual(['chat-1', 'chat-2']);
    expect(result.chats).toEqual([
      { chatId: 'chat-2', lastRunId: '0012' },
      { chatId: 'chat-1', lastRunId: '0011' }
    ]);
  });

  it('returns cache directly when baseUrl is empty', async () => {
    mockListCachedChats.mockResolvedValue([{ chatId: 'chat-local-1' }]);

    const result = await syncChatsIncremental('');

    expect(mockFetchApiJson).not.toHaveBeenCalled();
    expect(result).toEqual({ chats: [{ chatId: 'chat-local-1' }], updatedChatIds: [] });
  });

  it('fetchAndCacheChatDetail stores normalized payload', async () => {
    mockFetchApiJson.mockResolvedValue({
      chatId: 'chat-1',
      chatName: '会话一',
      chatImageToken: 'token-x',
      events: [{ type: 'content.snapshot', text: 'cached' }]
    });
    mockUpsertChatDetail.mockResolvedValue(undefined);

    const detail = await fetchAndCacheChatDetail('https://api.example.com', 'chat-1');

    expect(mockFetchApiJson).toHaveBeenCalledWith(
      'https://api.example.com',
      '/api/ap/chat?chatId=chat-1'
    );
    expect(mockUpsertChatDetail).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'chat-1',
        chatName: '会话一',
        chatImageToken: 'token-x',
        events: [{ type: 'content.snapshot', text: 'cached' }]
      })
    );
    expect(detail.chatId).toBe('chat-1');
  });
});
