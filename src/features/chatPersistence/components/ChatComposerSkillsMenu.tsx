import { memo, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import {
  skillIdentity,
  type ChatSkillsCatalog,
  type ChatSkill,
  type ChatSkillPackage
} from '../../../core/api/services/chatSkillsProtocol';
import { useT } from '../../../shared/i18n';
import { AppIcon } from '../../../shared/icons/AppIcon';
import { cn } from '../../../shared/visual/className';

type Props = {
  catalog: ChatSkillsCatalog | null;
  selected: readonly string[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  onToggle: (ids: readonly string[]) => void;
};
type Row = { id: string; skill: ChatSkill; parent?: string } | { id: string; pkg: ChatSkillPackage };
export const ChatComposerSkillsMenu = memo(function ChatComposerSkillsMenu({
  catalog,
  selected,
  loading,
  error,
  onRetry,
  onToggle
}: Props) {
  const t = useT();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const checked = useMemo(() => new Set(selected.map(skillIdentity)), [selected]);
  const rows = useMemo<Row[]>(() => {
    if (!catalog) return [];
    const needle = search.trim().toLowerCase();
    const available = new Map(catalog.skills.map((skill) => [skillIdentity(skill.id), skill]));
    const grouped = new Set<string>();
    const result: Row[] = [];
    const matches = (key: string, label: string) => !needle || `${key}\n${label}`.toLowerCase().includes(needle);
    for (const pkg of catalog.packages) {
      const members = pkg.members.flatMap((key) => {
        const id = skillIdentity(key),
          skill = available.get(id);
        if (!skill || grouped.has(id)) return [];
        grouped.add(id);
        return [skill];
      });
      const packageMatch = matches(pkg.id, pkg.label);
      const visible = members.filter((skill) => packageMatch || matches(skill.id, skill.label));
      if (!packageMatch && !visible.length) continue;
      result.push({ id: `package:${pkg.id}`, pkg });
      if (expanded.has(pkg.id) || needle)
        for (const skill of visible) result.push({ id: `skill:${skill.id}`, skill, parent: pkg.id });
    }
    for (const skill of catalog.skills)
      if (!grouped.has(skillIdentity(skill.id)) && matches(skill.id, skill.label))
        result.push({ id: `skill:${skill.id}`, skill });
    const ranks = new Map(catalog.pinned.map((key, index) => [skillIdentity(key), index]));
    // Sort blocks, preserving each package's child order.
    const blocks: Row[][] = [];
    for (const row of result) {
      if ('skill' in row && row.parent) blocks[blocks.length - 1]?.push(row);
      else blocks.push([row]);
    }
    blocks.sort((a, b) => {
      const key = (row: Row) => ('pkg' in row ? row.pkg.id : row.skill.id);
      const label = (row: Row) => ('pkg' in row ? row.pkg.label : row.skill.label);
      return (
        (ranks.get(skillIdentity(key(a[0]))) ?? catalog.pinned.length) -
          (ranks.get(skillIdentity(key(b[0]))) ?? catalog.pinned.length) || label(a[0]).localeCompare(label(b[0]))
      );
    });
    return blocks.flat();
  }, [catalog, expanded, search]);
  return (
    <View className="h-[300px] gap-app-xs">
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder={t('composer.skills.search')}
        accessibilityLabel={t('composer.skills.search')}
        autoCorrect={false}
        autoCapitalize="none"
        className="h-[40px] rounded-app-md border border-app-line px-app-sm text-[14px] text-app-primary"
      />
      {error ? (
        <Pressable onPress={onRetry} accessibilityRole="button">
          <Text className="text-[13px] text-app-danger">
            {error} · {t('composer.skills.retry')}
          </Text>
        </Pressable>
      ) : null}
      <FlatList
        data={rows}
        keyExtractor={(row) => row.id}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={8}
        windowSize={3}
        className="flex-1"
        extraData={checked}
        ListEmptyComponent={
          <Text className="p-app-sm text-[13px] text-app-tertiary">
            {t(loading ? 'composer.skills.loading' : 'composer.skills.empty')}
          </Text>
        }
        renderItem={({ item }) => {
          const pkg = 'pkg' in item ? item.pkg : null;
          const skill = 'skill' in item ? item.skill : null;
          const ids = pkg ? pkg.members : [skill!.id];
          const isChecked = ids.length > 0 && ids.every((key) => checked.has(skillIdentity(key)));
          return (
            <View
              className={cn(
                'min-h-[54px] flex-row items-center rounded-app-md',
                skill && 'parent' in item ? 'pl-app-md' : null
              )}
            >
              <Pressable
                onPress={() => onToggle(ids)}
                disabled={ids.length === 0}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isChecked, disabled: ids.length === 0 }}
                accessibilityLabel={pkg?.label ?? skill!.label}
                className={cn(
                  'min-h-[54px] flex-1 flex-row items-center gap-app-sm px-app-sm',
                  isChecked ? 'bg-app-brand-blue-soft' : null
                )}
              >
                <AppIcon
                  usage={
                    pkg
                      ? expanded.has(pkg.id)
                        ? 'composer.skillPackageOpen'
                        : 'composer.skillPackage'
                      : 'composer.skills'
                  }
                />
                <View className="flex-1">
                  <Text numberOfLines={1} className="text-[15px] text-app-primary">
                    {pkg?.label ?? skill!.label}
                  </Text>
                  <Text numberOfLines={1} className="text-[12px] text-app-tertiary">
                    {pkg
                      ? `${pkg.members.length} · ${pkg.incomplete ? t('composer.skills.incomplete') : pkg.id}`
                      : `${skill!.id}${skill!.configured ? ` · ${t('composer.skills.configured')}` : ''}`}
                  </Text>
                </View>
                {isChecked ? <AppIcon usage="composer.optionSelected" size={18} /> : null}
              </Pressable>
              {pkg ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('composer.skills.expand')}
                  onPress={() =>
                    setExpanded((current) => {
                      const next = new Set(current);
                      if (next.has(pkg.id)) next.delete(pkg.id);
                      else next.add(pkg.id);
                      return next;
                    })
                  }
                  className="h-[44px] w-[44px] items-center justify-center"
                >
                  <AppIcon usage={expanded.has(pkg.id) ? 'runtime.planCollapse' : 'runtime.planExpand'} />
                </Pressable>
              ) : null}
            </View>
          );
        }}
      />
    </View>
  );
});
