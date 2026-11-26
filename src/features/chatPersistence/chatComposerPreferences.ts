import type { QueryAccessLevel, QueryModelOverride } from '../../core/api/services/modelOptionsProtocol.ts';

export type ChatComposerPreference = {
  accessLevel?: QueryAccessLevel;
  model?: QueryModelOverride;
  skillIds?: string[];
};
export type ChatComposerPreferenceTarget = { owner: string; scope: string; kind: 'chat' | 'agent'; id: string };
const preferences = new Map<string, { target: ChatComposerPreferenceTarget; value: ChatComposerPreference }>();
const submissions = new Map<
  string,
  { target: ChatComposerPreferenceTarget; value: ChatComposerPreference; requestId?: string }
>();
const listeners = new Set<() => void>();
let revision = 0;
const keyOf = (target: ChatComposerPreferenceTarget) =>
  JSON.stringify([target.owner, target.scope, target.kind, target.id]);
const notify = () => {
  revision++;
  listeners.forEach((listener) => listener());
};
export const getChatComposerPreferenceRevision = () => revision;
export function subscribeChatComposerPreferences(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function readChatComposerPreference(target: ChatComposerPreferenceTarget): ChatComposerPreference | undefined {
  return preferences.get(keyOf(target))?.value;
}
export function writeChatComposerPreference(target: ChatComposerPreferenceTarget, patch: ChatComposerPreference): void {
  const key = keyOf(target);
  const value = { ...preferences.get(key)?.value, ...patch };
  if (JSON.stringify(value) === JSON.stringify(preferences.get(key)?.value)) return;
  preferences.set(key, { target, value });
  notify();
}
export function rememberChatComposerSubmission(
  target: ChatComposerPreferenceTarget,
  value: ChatComposerPreference
): (requestId?: string) => void {
  const key = keyOf(target);
  if (preferences.get(key)?.value.model) return () => {};
  const submitted = { target, value, requestId: '' };
  submissions.set(key, submitted);
  return (requestId) => {
    if (submissions.get(key) !== submitted) return;
    if (requestId) submitted.requestId = requestId;
    else submissions.delete(key);
    notify();
  };
}
export function confirmChatComposerSubmission(
  target: ChatComposerPreferenceTarget,
  confirmedRequestIds: readonly string[]
): ChatComposerPreference | undefined {
  const key = keyOf(target),
    submitted = submissions.get(key);
  if (!submitted?.requestId || !confirmedRequestIds.includes(submitted.requestId)) return;
  submissions.delete(key);
  const existing = preferences.get(key)?.value;
  const value = { ...submitted.value, ...existing };
  writeChatComposerPreference(target, value);
  return value;
}
export function clearChatComposerPreferences(owner?: string, scope?: string, chatId?: string): void {
  for (const map of [preferences, submissions]) {
    for (const [key, entry] of map)
      if (
        (!owner || entry.target.owner === owner) &&
        (!scope || entry.target.scope === scope) &&
        (!chatId || (entry.target.kind === 'chat' && entry.target.id === chatId))
      )
        map.delete(key);
  }
  notify();
}

export function reviseChatComposerSubmissionModel(target: ChatComposerPreferenceTarget, model: QueryModelOverride) {
  const submitted = submissions.get(keyOf(target));
  if (submitted) submitted.value = { ...submitted.value, model };
}
