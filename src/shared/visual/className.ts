export type ClassNameValue = string | false | null | undefined;

export function cn(...values: ClassNameValue[]): string {
  return values.filter((value): value is string => typeof value === 'string' && value.length > 0).join(' ');
}
