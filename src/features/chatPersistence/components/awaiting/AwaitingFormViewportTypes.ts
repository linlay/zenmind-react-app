import type { AwaitingSubmitParam } from '../../../../core/api/services/chatApi';
import type { ChatConversationAwaitingState } from '../../../chatRealtime/types';

export type AwaitingFormViewportHandle = { collect: () => Promise<AwaitingSubmitParam> };
export type AwaitingFormViewportProps = {
  awaiting: ChatConversationAwaitingState;
  disabled: boolean;
  documentKey: string;
  onError: (message: string) => void;
};
