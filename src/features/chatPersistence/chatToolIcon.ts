import type { AppIconUsage } from '../../shared/icons/registries/appIconUsages.ts';

// Match builtin tool IDs only, as in Desktop. Connector names and labels stay generic.
const TOOL_ICON_USAGES: Readonly<Record<string, AppIconUsage>> = {
  wait: 'runtime.toolWait',
  catalog_query: 'runtime.toolRead',
  catalog_manage: 'runtime.toolEdit',
  chat_query: 'runtime.toolRead',
  chat_manage: 'runtime.toolEdit',
  platform_inspect: 'runtime.toolRead',
  run_env: 'runtime.toolRun',
  image_generate: 'runtime.toolImage',
  file_read: 'runtime.toolRead',
  file_write: 'runtime.toolWrite',
  file_edit: 'runtime.toolEdit',
  file_glob: 'runtime.toolGlob',
  file_grep: 'runtime.toolGrep',
  vision_recognize: 'runtime.toolVision',
  web_fetch: 'runtime.toolWeb',
  bash: 'runtime.toolBash',
  bash_sandbox: 'runtime.toolBash',
  _sandbox_bash_: 'runtime.toolBash',
  desktop_shell: 'runtime.toolDesktop',
  desktop_settings: 'runtime.toolDesktop',
  desktop_site: 'runtime.toolDesktop',
  desktop_webapp: 'runtime.toolDesktop',
  desktop_service: 'runtime.toolDesktop',
  desktop_market: 'runtime.toolDesktop',
  desktop_kanban: 'runtime.toolDesktop',
  desktop_action: 'runtime.toolDesktop',
  desktop_cdp: 'runtime.toolBrowser',
  plan_add_tasks: 'runtime.toolPlan',
  plan_get_tasks: 'runtime.toolPlan',
  plan_update_task: 'runtime.toolPlan',
  finalize_planning: 'runtime.toolPlan',
  ask_user_question: 'runtime.toolQuestion',
  ask_user_form: 'runtime.toolQuestion',
  agent_invoke: 'runtime.toolAgent',
  agent_delegate: 'runtime.toolAgent',
  run_query: 'runtime.toolRun',
  run_status: 'runtime.toolRun',
  run_interrupt: 'runtime.toolRun',
  artifact_publish: 'runtime.toolPublish',
  datetime: 'runtime.toolDatetime',
  regex: 'runtime.toolRegex'
};

export function resolveChatToolIconUsage(toolNames: readonly (string | null | undefined)[]): AppIconUsage {
  const icons = toolNames.map((name) => {
    const key = name?.trim().toLowerCase() || '';
    return Object.prototype.hasOwnProperty.call(TOOL_ICON_USAGES, key) ? TOOL_ICON_USAGES[key] : 'runtime.tool';
  });
  const first = icons[0];
  return first && icons.every((icon) => icon === first) ? first : 'runtime.tool';
}
