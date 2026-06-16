import type { AwaitingSubmitParamData } from '../../../../core/api/services/chatApi';
import type { ChatConversationAwaitingState } from '../../../chatRealtime/types';
import type { ChatTimelineAwaitingForm } from '../../../chatTimeline/index.ts';

export type AwaitingFormCollectDecision = 'submit' | 'reject';

export type AwaitingFormViewportHandle = {
  collect: (decision: AwaitingFormCollectDecision) => Promise<AwaitingSubmitParamData[]>;
};

export type AwaitingFormViewportProps = {
  awaiting: ChatConversationAwaitingState;
  activeFormIndex: number;
  disabled: boolean;
  forms: readonly ChatTimelineAwaitingForm[];
  timeoutMs: number | null;
  viewportKey: string;
  onSubmitParams: (params: AwaitingSubmitParamData[]) => void;
  onError: (message: string) => void;
};
