import type { TFunction } from '../../shared/i18n';
import type { BoardViewText } from './kanbanViewModel';

export function createBoardViewText(t: TFunction): BoardViewText {
  return {
    noDescription: t('tasks.fallback.noDescription'),
    completedDue: t('tasks.fallback.completedDue'),
    unscheduledDue: t('tasks.fallback.unscheduledDue'),
    untitledTask: t('tasks.fallback.untitledTask'),
    unassignedAgent: t('tasks.agent.unassigned'),
    actionRunFailed: t('tasks.action.runFailed'),
    actionRunCancelled: t('tasks.action.runCancelled'),
    actionAssignAgent: t('tasks.action.assignAgent'),
    actionWaitingRun: t('tasks.action.waitingRun'),
    actionTrackRun: t('tasks.action.trackRun'),
    actionReview: t('tasks.action.reviewOrReturn'),
    actionArchive: t('tasks.action.archive'),
    blockerRunFailed: t('tasks.blocker.runFailed'),
    blockerRunCancelled: t('tasks.blocker.runCancelled'),
    blockerReviewRequired: t('tasks.blocker.reviewRequired'),
    catalogAgentFallback: t('tasks.agent.catalogFallback'),
    desktopOnline: t('tasks.agent.desktopOnline'),
    existingAssignee: t('tasks.agent.existingAssignee')
  };
}
