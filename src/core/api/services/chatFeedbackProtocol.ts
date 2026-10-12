import { isRemoteEpochMillis } from './chatRemoteTimeProtocol.ts';
export const CHAT_FEEDBACK_TRANSPORT_TYPE = '/api/feedback';
export const MAX_FEEDBACK_COMMENT_CHARS = 4000;
export type ChatFeedbackType = 'thumbs_down' | 'clear';
export type ChatFeedbackResponse = { chatId: string; runId: string; type: ChatFeedbackType; setAt?: number };
export function validateChatFeedbackResponse(
  value: unknown,
  chatId: string,
  runId: string,
  type: ChatFeedbackType
): ChatFeedbackResponse {
  if (!value || typeof value !== 'object') throw new Error('Invalid feedback response');
  const result = value as ChatFeedbackResponse;
  if (
    result.chatId !== chatId ||
    result.runId !== runId ||
    result.type !== type ||
    (type === 'thumbs_down' ? !isRemoteEpochMillis(result.setAt) : result.setAt !== undefined)
  )
    throw new Error('Feedback response does not match this run');
  return result;
}
