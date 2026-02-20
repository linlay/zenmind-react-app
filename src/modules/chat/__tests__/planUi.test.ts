import { buildCollapsedPlanText, cleanPlanTaskDescription } from '../utils/planUi';
import { PlanTask } from '../types/chat';

describe('planUi', () => {
  it('cleans status and task id prefix from task description', () => {
    const task: PlanTask = {
      taskId: '6dc8ab4f',
      description: '[completed] 6dc8ab4f · 硬盘检查完成：主分区使用率22%',
      status: 'done'
    };
    expect(cleanPlanTaskDescription(task)).toBe('硬盘检查完成：主分区使用率22%');
  });

  it('builds collapsed text with running task', () => {
    const tasks: PlanTask[] = [
      { taskId: 't1', description: '[completed] task-1: 已检查网络', status: 'done' },
      { taskId: 't2', description: '2f66b8a1: 确认天气情况', status: 'running' },
      { taskId: 't3', description: '输出结论', status: 'init' }
    ];
    expect(buildCollapsedPlanText(tasks)).toBe('2/3 正在确认天气情况');
  });

  it('falls back to last task when no running task exists', () => {
    const tasks: PlanTask[] = [
      { taskId: 't1', description: '收集信息', status: 'done' },
      { taskId: 't2', description: '[done] task-2: 完成总结', status: 'done' }
    ];
    expect(buildCollapsedPlanText(tasks)).toBe('2/2 完成总结');
  });
});
