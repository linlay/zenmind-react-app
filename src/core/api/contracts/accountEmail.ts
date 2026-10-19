export type AccountEmailReceipt = { ok: true; expiresAt: string };

const EMAIL_PATTERN =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/u;

export function normalizeAccountEmail(value: string): { email: string; key: string } | null {
  const email = value.trim();
  const [local, domain] = email.split('@');
  if (
    email.length > 254 ||
    local.length > 64 ||
    !EMAIL_PATTERN.test(email) ||
    domain.split('.').some((label) => label.length > 63)
  )
    return null;
  return { email, key: email.toLowerCase() };
}

export function parseAccountEmailReceipt(value: unknown, nowMs = Date.now()): AccountEmailReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid account email response');
  const v = value as Record<string, unknown>;
  if (
    v.ok !== true ||
    typeof v.expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(v.expiresAt)) ||
    Date.parse(v.expiresAt) <= nowMs
  )
    throw new Error('Invalid account email response');
  return { ok: true, expiresAt: v.expiresAt };
}
export function isAccountEmailVerification(email: string, code: string): boolean {
  return Boolean(normalizeAccountEmail(email)) && /^\d{6}$/u.test(code);
}
