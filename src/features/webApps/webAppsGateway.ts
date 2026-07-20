import { resolveActiveWsTransportConfig } from '../../core/api/activeWsTransport';
import { getActiveDeviceProfile } from '../../core/auth/deviceProfiles';
import { sharedWsTransport } from '../../core/ws/sharedWsTransport';
import { createDesktopWebAppsGateway } from './webAppsGatewayCore';

export const webAppsGateway = createDesktopWebAppsGateway({
  getActiveProfile: getActiveDeviceProfile,
  resolveTransport: resolveActiveWsTransportConfig,
  request: (options) => sharedWsTransport.request(options),
  subscribePush: (listener) => sharedWsTransport.subscribePush(listener),
  subscribeStatus: (listener) => sharedWsTransport.subscribeStatus(listener),
  getStatus: () => sharedWsTransport.getStatus()
});
