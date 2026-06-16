import type {
  AwaitingApprovalDecision,
  AwaitingApprovalSubmitParamData,
  AwaitingQuestionSubmitParamData,
  AwaitingFormSubmitParamData,
  AwaitingPlanDecision,
  AwaitingPlanSubmitParamData,
  AwaitingSubmitParamData,
  AwaitingSubmitPayloadData,
} from '../../../../core/api/services/chatApi';
import type {
  ChatTimelineAwaitingApproval,
  ChatTimelineAwaitingForm,
  ChatTimelineAwaitingInteractive,
  ChatTimelineAwaitingPlan,
  ChatTimelineAwaitingState,
} from '../../../chatTimeline/index.ts';
import {
  buildQuestionSubmitParams,
  type AwaitingQuestionDraft,
} from './awaitingQuestionState.ts';

export type AwaitingApprovalDraft = {
  decisions: Record<string, AwaitingApprovalDecision | undefined>;
  reasons: Record<string, string | undefined>;
};

export type AwaitingPlanDraft = {
  decision: AwaitingPlanDecision;
  reason?: string;
};

export type AwaitingFormDraft = {
  decision: 'approve' | 'reject';
  forms?: Record<string, Record<string, unknown> | null | undefined>;
  reasons?: Record<string, string | undefined>;
  rawParams?: AwaitingSubmitParamData[];
};

export type AwaitingSubmitDraft =
  | { kind: 'question'; values: readonly AwaitingQuestionDraft[] }
  | { kind: 'question-reject'; questionId: string }
  | ({ kind: 'approval' } & AwaitingApprovalDraft)
  | ({ kind: 'plan' } & AwaitingPlanDraft)
  | ({ kind: 'form' } & AwaitingFormDraft);

function trimText(value: unknown): string {
  return String(value ?? '').trim();
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeApprovalDecision(value: unknown): AwaitingApprovalDecision | null {
  return value === 'approve' || value === 'reject' || value === 'approve_rule_run' ? value : null;
}

function normalizePlanDecision(value: unknown): AwaitingPlanDecision | null {
  return value === 'approve' || value === 'reject' ? value : null;
}

function normalizeQuestionSubmitParam(item: Record<string, unknown>): AwaitingQuestionSubmitParamData | null {
  const id = trimText(item.id);
  if (!id) {
    return null;
  }
  const answerValue = item.answer;
  const answersValue = item.answers;
  if (
    typeof answerValue !== 'string' &&
    typeof answerValue !== 'number' &&
    !Array.isArray(answersValue)
  ) {
    return null;
  }
  const next: AwaitingQuestionSubmitParamData = { id };
  if (typeof answerValue === 'string' || typeof answerValue === 'number') {
    next.answer = answerValue;
  }
  if (Array.isArray(answersValue)) {
    const answers = answersValue.map(trimText).filter(Boolean);
    if (answers.length > 0) {
      next.answers = answers;
    }
  }
  return next;
}

function normalizeApprovalSubmitParam(item: Record<string, unknown>): AwaitingApprovalSubmitParamData | null {
  const id = trimText(item.id);
  const decision = normalizeApprovalDecision(item.decision);
  const reason = trimText(item.reason);
  if (!id || (!decision && !reason)) {
    return null;
  }
  if (decision) {
    return {
      id,
      decision,
      ...(reason ? { reason } : {}),
    };
  }
  return {
    id,
    reason,
  };
}

function normalizeFormSubmitParam(item: Record<string, unknown>): AwaitingFormSubmitParamData | null {
  const id = trimText(item.id);
  const decision = item.decision === 'approve' || item.decision === 'reject' ? item.decision : null;
  if (!id || !decision) {
    return null;
  }
  const form = isObjectRecord(item.form) ? { ...item.form } : item.form == null ? undefined : null;
  if (form === null || (decision === 'approve' && form === undefined)) {
    return null;
  }
  const reason = trimText(item.reason);
  return {
    id,
    decision,
    ...(reason && decision === 'reject' ? { reason } : {}),
    ...(form !== undefined ? { form } : {}),
  };
}

function cloneFormData(value: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  return value ? { ...value } : null;
}

function hasFormField(param: AwaitingFormSubmitParamData): boolean {
  return Object.prototype.hasOwnProperty.call(param, 'form');
}

function buildRejectParam(
  id: string,
  reason?: string,
  form?: Record<string, unknown> | null
): AwaitingFormSubmitParamData {
  const trimmedReason = trimText(reason);
  return {
    id,
    decision: 'reject',
    ...(trimmedReason ? { reason: trimmedReason } : {}),
    ...(form !== undefined ? { form: cloneFormData(form) } : {}),
  };
}

function normalizePlanSubmitParam(item: Record<string, unknown>): AwaitingPlanSubmitParamData | null {
  if ('answer' in item || 'answers' in item || 'payload' in item || 'form' in item) {
    return null;
  }
  const decision = normalizePlanDecision(item.decision);
  if (!decision) {
    return null;
  }
  const id = trimText(item.id);
  const reason = trimText(item.reason);
  const planningId = trimText(item.planningId);
  return {
    ...(id ? { id } : {}),
    decision,
    ...(reason ? { reason } : {}),
    ...(planningId ? { planningId } : {}),
  };
}

export function normalizeAwaitingSubmitParams(
  value: unknown,
  mode?: ChatTimelineAwaitingInteractive['kind']
): AwaitingSubmitParamData[] {
  if (!Array.isArray(value)) {
    return [];
  }
  if (mode === 'plan' && value.length !== 1) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => isObjectRecord(item))
    .map((item) => {
      if (mode === 'question') {
        return normalizeQuestionSubmitParam(item);
      }
      if (mode === 'approval') {
        return normalizeApprovalSubmitParam(item);
      }
      if (mode === 'form') {
        return normalizeFormSubmitParam(item);
      }
      if (mode === 'plan') {
        return normalizePlanSubmitParam(item);
      }
      return (
        normalizeApprovalSubmitParam(item) ??
        normalizeFormSubmitParam(item) ??
        normalizePlanSubmitParam(item) ??
        normalizeQuestionSubmitParam(item)
      );
    })
    .filter((item): item is AwaitingSubmitParamData => Boolean(item));
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
            ...(reason ? { reason } : {}),
          }
        : {
            id: approval.id,
            reason,
          }
    );
  }
  return params;
}

function getApprovalReason(
  approval: ChatTimelineAwaitingApproval,
  draft: AwaitingApprovalDraft
): string {
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

function buildFormParams(
  forms: readonly ChatTimelineAwaitingForm[],
  draft: AwaitingFormDraft
): AwaitingFormSubmitParamData[] {
  if (draft.rawParams) {
    return buildAggregatedFormParams(forms, draft.rawParams);
  }
  return forms.map((form) => {
    const formValue = draft.forms?.[form.id] ?? form.form ?? null;
    const reason = trimText(draft.reasons?.[form.id]);
    return {
      id: form.id,
      decision: draft.decision,
      ...(draft.decision === 'reject' && reason ? { reason } : {}),
      ...(draft.decision === 'approve' || formValue ? { form: cloneFormData(formValue) } : {}),
    };
  });
}

function buildAggregatedFormParams(
  forms: readonly ChatTimelineAwaitingForm[],
  rawParams: AwaitingSubmitParamData[]
): AwaitingFormSubmitParamData[] {
  const collectedParams = normalizeAwaitingSubmitParams(rawParams, 'form') as AwaitingFormSubmitParamData[];
  if (forms.length === 0) {
    return collectedParams;
  }
  const firstDecision = collectedParams[0]?.decision;
  const sharedReject =
    firstDecision === 'reject' &&
    collectedParams.length > 0 &&
    collectedParams.every((param) => param.decision === firstDecision);

  if (sharedReject) {
    const collectedById = new Map(collectedParams.map((param) => [param.id, param]));
    return forms.map((form) => {
      const collected = collectedById.get(form.id);
      return buildRejectParam(
        form.id,
        collected?.reason ?? collectedParams[0]?.reason,
        collected && hasFormField(collected) ? collected.form : form.form
      );
    });
  }

  const collectedById = new Map<string, AwaitingFormSubmitParamData>();
  for (const param of collectedParams) {
    collectedById.set(
      param.id,
      param.decision === 'approve' && hasFormField(param)
        ? { ...param, form: cloneFormData(param.form) }
        : { ...param }
    );
  }

  const params = forms.map((form) => {
    const collected = collectedById.get(form.id);
    collectedById.delete(form.id);
    if (collected?.decision === 'reject') {
      return buildRejectParam(form.id, collected.reason, hasFormField(collected) ? collected.form : form.form);
    }
    const submittedForm =
      collected?.decision === 'approve' && hasFormField(collected)
        ? cloneFormData(collected.form)
        : cloneFormData(form.form);
    return {
      id: form.id,
      decision: 'approve' as const,
      form: submittedForm,
    };
  });

  for (const param of collectedById.values()) {
    if (param.decision === 'reject') {
      params.push(buildRejectParam(param.id, param.reason, hasFormField(param) ? param.form : undefined));
      continue;
    }
    params.push({
      id: param.id,
      decision: 'approve',
      ...(hasFormField(param) ? { form: cloneFormData(param.form) } : {}),
    });
  }

  return params;
}

export function mergeSubmittedParamsIntoAwaitingForms(
  forms: readonly ChatTimelineAwaitingForm[],
  rawParams: AwaitingSubmitParamData[]
): readonly ChatTimelineAwaitingForm[] {
  const collectedParams = normalizeAwaitingSubmitParams(rawParams, 'form') as AwaitingFormSubmitParamData[];
  if (forms.length === 0 || collectedParams.length === 0) {
    return forms;
  }

  const collectedById = new Map(
    collectedParams
      .filter((param) => hasFormField(param))
      .map((param) => [param.id, param.form])
  );
  if (collectedById.size === 0) {
    return forms;
  }

  let changed = false;
  const nextForms = forms.map((form) => {
    if (!collectedById.has(form.id)) {
      return form;
    }
    changed = true;
    return {
      ...form,
      form: cloneFormData(collectedById.get(form.id)),
    };
  });

  return changed ? nextForms : forms;
}

function buildPlanParam(
  plan: ChatTimelineAwaitingPlan,
  draft: AwaitingPlanDraft
): AwaitingPlanSubmitParamData {
  const reason = trimText(draft.reason);
  return {
    id: plan.id || 'confirm',
    decision: draft.decision,
    ...(plan.planningId ? { planningId: plan.planningId } : {}),
    ...(draft.decision === 'reject' && reason ? { reason } : {}),
  };
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
      params: buildQuestionSubmitParams(interaction.questions, draft.values),
    };
  }

  if (draft.kind === 'question-reject' && interaction.kind === 'question') {
    return {
      runId: awaiting.runId,
      awaitingId: awaiting.awaitingId,
      params: [{ id: draft.questionId, decision: 'reject' }],
    };
  }

  if (draft.kind === 'approval' && interaction.kind === 'approval') {
    return {
      runId: awaiting.runId,
      awaitingId: awaiting.awaitingId,
      params: buildApprovalParams(interaction.approvals, draft),
    };
  }

  if (draft.kind === 'form' && interaction.kind === 'form') {
    return {
      runId: awaiting.runId,
      awaitingId: awaiting.awaitingId,
      params: buildFormParams(interaction.forms, draft),
    };
  }

  if (draft.kind === 'plan' && interaction.kind === 'plan') {
    return {
      runId: awaiting.runId,
      awaitingId: awaiting.awaitingId,
      params: [buildPlanParam(interaction.plan, draft)],
    };
  }

  throw new Error(`Awaiting draft ${draft.kind} does not match ${interaction.kind}`);
}
