import { readOfficialApiBaseUrl } from '../../auth/authConfig.ts';
import { sendAccountApiRequest } from '../accountRequest.ts';
import { ApiError } from '../apiError.ts';
import { parseAccountEmailReceipt, normalizeAccountEmail } from '../contracts/accountEmail.ts';
import type { I18nKey } from '../../../shared/i18n/messages/zh-CN.ts';

export async function requestEmailLoginCode(email: string, signal?: AbortSignal) {
  const normalized = normalizeAccountEmail(email);
  if (!normalized) throw new ApiError('invalid_email', 400, null);
  const base = readOfficialApiBaseUrl();
  if (!base) throw new Error('Official account API is not configured');
  return parseAccountEmailReceipt(
    await sendAccountApiRequest(base, {
      path: '/api/auth/email-code/start',
      method: 'POST',
      body: { email: normalized.email },
      credentials: 'include',
      signal
    })
  );
}
export function accountEmailErrorKey(error: unknown): I18nKey {
  if (error instanceof ApiError) {
    if (error.message === 'invalid_code') return 'accountEmail.error.authentication';
    if (error.message === 'account_disabled') return 'auth.error.disabled';
    if (error.status === 400) return 'auth.error.format';
    if (error.status === 401 || error.status === 403) return 'auth.error.session';
    if (error.status === 429) return 'auth.error.rate';
    if (error.status >= 500) return 'auth.error.service';
  }
  if (error instanceof Error && error.message === 'Invalid account email response') return 'auth.error.protocol';
  return 'auth.error.network';
}
