import { getAccountAccessTokenForRequest, getAccountAuthGeneration } from '../auth/accountAuth.ts';
import { ApiError } from './apiError.ts';

import { sendAccountApiRequest, type AccountApiRequestOptions } from './accountRequest.ts';
export type { AccountApiRequestOptions } from './accountRequest.ts';

export async function authenticatedAccountApiRequest<T>(
  baseUrl: string,
  options: AccountApiRequestOptions
): Promise<T> {
  const generation = getAccountAuthGeneration();
  const assertCurrent = () => {
    if (generation !== getAccountAuthGeneration() || options.signal?.aborted)
      throw new Error('Account request superseded');
  };
  let token = await getAccountAccessTokenForRequest(baseUrl);
  assertCurrent();
  if (!token) throw new ApiError('Not authenticated', 401, null);
  try {
    const result = await sendAccountApiRequest<T>(baseUrl, options, token);
    assertCurrent();
    return result;
  } catch (error) {
    assertCurrent();
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    token = await getAccountAccessTokenForRequest(baseUrl, true);
    assertCurrent();
    if (!token) throw new ApiError('Not authenticated', 401, null);
    const result = await sendAccountApiRequest<T>(baseUrl, options, token);
    assertCurrent();
    return result;
  }
}
