export const CHAT_SKILLS_TRANSPORT_TYPE = '/api/skills';
export type ChatSkill = { key: string; label: string; description: string; configured: boolean };
export type ChatSkillPackage = { key: string; label: string; members: string[]; incomplete: boolean };
export type ChatSkillsCatalog = {
  skills: ChatSkill[];
  packages: ChatSkillPackage[];
  pinned: string[];
  fetchedAt: number;
};
export const skillIdentity = (key: string) => key.trim().toLowerCase();
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export function normalizeRequiredSkills(value: unknown): string[] {
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
export function parseStoredRequiredSkills(json: string): string[] {
  // Corrupt pending requirements must stop replay, not silently become an ordinary query.
  const value: unknown = JSON.parse(json);
  if (!Array.isArray(value)) throw new Error('Invalid stored required skill IDs');
  return normalizeRequiredSkills(value);
}
export function normalizeChatSkills(value: unknown, configured: unknown = []): ChatSkillsCatalog {
  const input = record(value);
  if (!Array.isArray(input.skills)) throw new Error('Invalid skills catalog');
  const skills = new Map<string, ChatSkill>();
  for (const raw of input.skills) {
    const item = record(raw),
      key = text(item.key),
      id = skillIdentity(key);
    if (!id || skills.has(id)) continue;
    skills.set(id, {
      key,
      label: text(item.displayName) || text(item.name) || key,
      description: text(item.description),
      configured: item.configured === true
    });
  }
  for (const raw of Array.isArray(configured) ? configured : []) {
    const item = typeof raw === 'string' ? { key: raw } : record(raw);
    const key = text(item.key),
      id = skillIdentity(key);
    if (!id) continue;
    const current = skills.get(id);
    skills.set(
      id,
      current
        ? { ...current, configured: true }
        : {
            key,
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
    const memberIds = normalizeRequiredSkills(
      (Array.isArray(item.skills) ? item.skills : []).map((raw) => text(record(raw).id))
    );
    const members = memberIds.flatMap((key) => skills.get(skillIdentity(key))?.key ?? []);
    packages.set(id, {
      key,
      label: text(item.displayName) || text(item.name) || key,
      members,
      incomplete:
        members.length !== memberIds.length ||
        item.status === 'incomplete' ||
        (Array.isArray(item.missingSkillIds) && item.missingSkillIds.length > 0)
    });
  }
  const pinned = normalizeRequiredSkills(input.pinned ?? []);
  const ranks = new Map(pinned.map((key, index) => [skillIdentity(key), index]));
  const order = (a: { key: string; label: string }, b: { key: string; label: string }) =>
    (ranks.get(skillIdentity(a.key)) ?? pinned.length) - (ranks.get(skillIdentity(b.key)) ?? pinned.length) ||
    a.label.localeCompare(b.label) ||
    a.key.localeCompare(b.key);
  return {
    skills: [...skills.values()].sort(order),
    packages: [...packages.values()].sort(order),
    pinned,
    fetchedAt: Date.now()
  };
}
export function resolveRequiredSkillIds(ids: readonly string[], catalog: ChatSkillsCatalog): string[] {
  const available = new Map(catalog.skills.map((skill) => [skillIdentity(skill.key), skill.key]));
  return normalizeRequiredSkills(ids).map((id) => {
    const key = available.get(skillIdentity(id));
    if (!key) throw new Error(`Skill is no longer available: ${id}`);
    return key;
  });
}
export function toggleRequiredSkills(current: readonly string[], members: readonly string[]): string[] {
  const selected = new Set(current.map(skillIdentity));
  const ids = new Set(members.map(skillIdentity));
  return members.every((key) => selected.has(skillIdentity(key)))
    ? current.filter((key) => !ids.has(skillIdentity(key)))
    : normalizeRequiredSkills([...current, ...members]);
}
