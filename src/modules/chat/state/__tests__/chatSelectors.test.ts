import { RootState } from '../../../../app/store/store';
import { selectFilteredChats } from '../chatSelectors';

function createState(chats: Array<Record<string, unknown>>, chatKeyword = ''): RootState {
  return {
    chat: {
      chats,
      chatId: '',
      chatKeyword,
      statusText: '',
      loadingChats: false
    }
  } as unknown as RootState;
}

describe('chatSelectors', () => {
  it('sorts chats by updatedAt and then createdAt', () => {
    const state = createState([
      { chatId: 'chat-1', chatName: 'one', updatedAt: new Date(2026, 1, 20, 8, 0, 0).getTime() },
      { chatId: 'chat-2', chatName: 'two', updatedAt: new Date(2026, 1, 21, 8, 0, 0).getTime() },
      { chatId: 'chat-3', chatName: 'three', createdAt: new Date(2026, 1, 19, 8, 0, 0).getTime() }
    ]);

    const result = selectFilteredChats(state);
    expect(result.map((item) => item.chatId)).toEqual(['chat-2', 'chat-1', 'chat-3']);
  });

  it('matches keyword by chatName only and does not match title', () => {
    const state = createState(
      [
        { chatId: 'chat-1', chatName: 'Alpha 会话', title: '不会用于匹配' },
        { chatId: 'chat-2', chatName: 'Beta 会话', title: 'Alpha 标题' }
      ],
      'alpha'
    );

    const result = selectFilteredChats(state);
    expect(result.map((item) => item.chatId)).toEqual(['chat-1']);
  });

  it('still allows keyword matching by chatId for定位', () => {
    const state = createState(
      [
        { chatId: 'chat-target', chatName: '普通会话', title: '无关键字' },
        { chatId: 'chat-other', chatName: '其他会话', title: 'chat-target 标题' }
      ],
      'target'
    );

    const result = selectFilteredChats(state);
    expect(result.map((item) => item.chatId)).toEqual(['chat-target']);
  });
});
