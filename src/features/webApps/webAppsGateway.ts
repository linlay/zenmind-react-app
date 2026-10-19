import { resolveActiveWsTransportConfig } from '../../core/api/activeWsTransport';
import { getAccountAuthSnapshot } from '../../core/auth/accountAuth';
import { readActiveDesktopId } from '../../core/auth/activeDesktop';
import { sharedWsTransport } from '../../core/ws/sharedWsTransport';
import { createDesktopWebAppsGateway } from './webAppsGatewayCore';

export const webAppsGateway = createDesktopWebAppsGateway({
  getActiveDesktopId: () => {
    const accountId = getAccountAuthSnapshot().session?.accountId;
    return accountId ? readActiveDesktopId(accountId) : '';
  },
  resolveTransport: resolveActiveWsTransportConfig,
  request: (options) => sharedWsTransport.request(options),
  subscribePush: (listener) => sharedWsTransport.subscribePush(listener),
  subscribeStatus: (listener) => sharedWsTransport.subscribeStatus(listener),
  getStatus: () => sharedWsTransport.getStatus()
});
