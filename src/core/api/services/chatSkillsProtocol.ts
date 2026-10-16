export const CHAT_SKILLS_TRANSPORT_TYPE = '/api/skills';
export type ChatSkill = { id: string; label: string; description: string; configured: boolean };
export type ChatSkillPackage = { id: string; label: string; members: string[]; incomplete: boolean };
export type ChatSkillsCatalog = {
  skills: ChatSkill[];
  packages: ChatSkillPackage[];
  pinned: string[];
  fetchedAt: number;
};
export const skillIdentity = (id: string) => id.trim().toLowerCase();
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export function normalizeSkillIds(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((key) => typeof key !== 'string'))
    throw new Error('Invalid required skill IDs');
  const seen = new Set<string>();
  return value.flatMap((key) => {
    const id = skillIdentity(key);
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [key.trim()];
  });
}
export function normalizeChatSkills(value: unknown, configured: unknown = []): ChatSkillsCatalog {
  const input = record(value);
  if (!Array.isArray(input.skills)) throw new Error('Invalid skills catalog');
  const skills = new Map<string, ChatSkill>();
  for (const raw of input.skills) {
    const item = record(raw),
      key = text(item.id),
      id = skillIdentity(key);
    if (!id || skills.has(id)) continue;
    skills.set(id, {
      id: key,
      label: text(item.displayName) || text(item.name) || key,
      description: text(item.description),
      configured: item.configured === true
    });
  }
  for (const raw of Array.isArray(configured) ? configured : []) {
    const item = typeof raw === 'string' ? { id: raw } : record(raw);
    const key = text(item.id),
      id = skillIdentity(key);
    if (!id) continue;
    const current = skills.get(id);
    skills.set(
      id,
      current
        ? { ...current, configured: true }
        : {
            id: key,
            label: text(item.displayName) || text(item.name) || key,
            description: text(item.description),
            configured: true
          }
    );
  }
  const packages = new Map<string, ChatSkillPackage>();
  for (const raw of Array.isArray(input.packages) ? input.packages : []) {
    const item = record(raw),
      key = text(item.id),
      id = skillIdentity(key);
    if (!id || packages.has(id)) continue;
    const memberIds = normalizeSkillIds(
      (Array.isArray(item.skills) ? item.skills : []).map((raw) => text(record(raw).id))
    );
    const members = memberIds.flatMap((key) => skills.get(skillIdentity(key))?.id ?? []);
    packages.set(id, {
      id: key,
      label: text(item.displayName) || text(item.name) || key,
      members,
      incomplete:
        members.length !== memberIds.length ||
        item.status === 'incomplete' ||
        (Array.isArray(item.missingSkillIds) && item.missingSkillIds.length > 0)
    });
  }
  const pinned = normalizeSkillIds(input.pinned ?? []);
  const ranks = new Map(pinned.map((key, index) => [skillIdentity(key), index]));
  const order = (a: { id: string; label: string }, b: { id: string; label: string }) =>
    (ranks.get(skillIdentity(a.id)) ?? pinned.length) - (ranks.get(skillIdentity(b.id)) ?? pinned.length) ||
    a.label.localeCompare(b.label) ||
    a.id.localeCompare(b.id);
  return {
    skills: [...skills.values()].sort(order),
    packages: [...packages.values()].sort(order),
    pinned,
    fetchedAt: Date.now()
  };
}
export function resolveSkillIds(ids: readonly string[], catalog: ChatSkillsCatalog): string[] {
  const available = new Map(catalog.skills.map((skill) => [skillIdentity(skill.id), skill.id]));
  return normalizeSkillIds(ids).map((id) => {
    const key = available.get(skillIdentity(id));
    if (!key) throw new Error(`Skill is no longer available: ${id}`);
    return key;
  });
}
export function toggleSkills(current: readonly string[], members: readonly string[]): string[] {
  const selected = new Set(current.map(skillIdentity));
  const ids = new Set(members.map(skillIdentity));
  return members.every((key) => selected.has(skillIdentity(key)))
    ? current.filter((key) => !ids.has(skillIdentity(key)))
    : normalizeSkillIds([...current, ...members]);
}
