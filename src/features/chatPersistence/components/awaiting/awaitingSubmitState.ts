import type {
  AwaitingApprovalDecision,
  AwaitingApprovalSubmitParamData,
  AwaitingPlanDecision,
  AwaitingSubmitParam,
  AwaitingSubmitPayloadData
} from '../../../../core/api/services/chatApi';
import type { ChatTimelineAwaitingApproval, ChatTimelineAwaitingState } from '../../../chatTimeline/index.ts';
import { buildQuestionSubmitParams, type AwaitingQuestionDraft } from './awaitingQuestionState.ts';

export type AwaitingApprovalDraft = {
  decisions: Record<string, AwaitingApprovalDecision | undefined>;
  reasons: Record<string, string | undefined>;
};

export type AwaitingPlanDraft = {
  decision: AwaitingPlanDecision;
  reason?: string;
};

export type AwaitingFormDraft = AwaitingSubmitParam;

export type AwaitingSubmitDraft =
  | { kind: 'question'; values: readonly AwaitingQuestionDraft[] }
  | { kind: 'question-reject'; questionId: string }
  | ({ kind: 'approval' } & AwaitingApprovalDraft)
  | ({ kind: 'plan' } & AwaitingPlanDraft)
  | ({ kind: 'form' } & AwaitingFormDraft);

function trimText(value: unknown): string {
  return String(value ?? '').trim();
}

function buildApprovalParams(
  approvals: readonly ChatTimelineAwaitingApproval[],
  draft: AwaitingApprovalDraft
): AwaitingApprovalSubmitParamData[] {
  const params: AwaitingApprovalSubmitParamData[] = [];
  for (const approval of approvals) {
    const decision = draft.decisions[approval.id];
    const reason = getApprovalReason(approval, draft);
    if (!decision && !reason) {
      continue;
    }
    params.push(
      decision
        ? {
            id: approval.id,
            decision,
            ...(reason ? { reason } : {})
          }
        : {
            id: approval.id,
            reason
          }
    );
  }
  return params;
}

function getApprovalReason(approval: ChatTimelineAwaitingApproval, draft: AwaitingApprovalDraft): string {
  return approval.allowFreeText ? trimText(draft.reasons[approval.id]) : '';
}

export function hasAwaitingApprovalResponse(
  approval: ChatTimelineAwaitingApproval,
  draft: AwaitingApprovalDraft
): boolean {
  return Boolean(draft.decisions[approval.id] || getApprovalReason(approval, draft));
}

export function findMissingApprovalIndex(
  approvals: readonly ChatTimelineAwaitingApproval[],
  draft: AwaitingApprovalDraft
): number {
  for (let index = 0; index < approvals.length; index += 1) {
    if (!hasAwaitingApprovalResponse(approvals[index], draft)) {
      return index;
    }
  }
  return -1;
}

export function buildAwaitingSubmitPayload(
  awaiting: ChatTimelineAwaitingState,
  draft: AwaitingSubmitDraft
): AwaitingSubmitPayloadData {
  const interaction = awaiting.interactive;
  if (!interaction) {
    throw new Error('Awaiting interaction is missing');
  }

  if (draft.kind === 'question' && interaction.kind === 'question') {
    return {
      runId: awaiting.runId,
      awaitingId: awaiting.awaitingId,
      params: buildQuestionSubmitParams(interaction.questions, draft.values)
    };
  }

  if (draft.kind === 'question-reject' && interaction.kind === 'question') {
    return {
      runId: awaiting.runId,
      awaitingId: awaiting.awaitingId,
      params: [{ id: draft.questionId, decision: 'reject' }]
    };
  }

  if (draft.kind === 'approval' && interaction.kind === 'approval') {
    return {
      runId: awaiting.runId,
      awaitingId: awaiting.awaitingId,
      params: buildApprovalParams(interaction.approvals, draft)
    };
  }

  if (draft.kind === 'form' && interaction.kind === 'form') {
    return {
      runId: awaiting.runId,
      awaitingId: awaiting.awaitingId,
      param: {
        decision: draft.decision,
        ...(draft.data !== undefined ? { data: draft.data } : {}),
        ...(draft.reason ? { reason: draft.reason } : {})
      }
    };
  }

  if (draft.kind === 'plan' && interaction.kind === 'plan') {
    return {
      runId: awaiting.runId,
      awaitingId: awaiting.awaitingId,
      param: { decision: draft.decision, ...(trimText(draft.reason) ? { reason: trimText(draft.reason) } : {}) }
    };
  }

  throw new Error(`Awaiting draft ${draft.kind} does not match ${interaction.kind}`);
}
