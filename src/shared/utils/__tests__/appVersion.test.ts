type ApplicationMock = {
  nativeApplicationVersion?: string | null;
  nativeBuildVersion?: string | null;
};

function loadVersionLabel(application: ApplicationMock, expoConfig: unknown): string {
  jest.resetModules();
  jest.doMock('expo-application', () => application);
  jest.doMock('expo-constants', () => ({
    __esModule: true,
    default: { expoConfig }
  }));
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getAppVersionLabel } = require('../appVersion') as { getAppVersionLabel: () => string };
  return getAppVersionLabel();
}

describe('getAppVersionLabel', () => {
  it('formats native version and build when both are available', () => {
    expect(
      loadVersionLabel({ nativeApplicationVersion: '1.0.1', nativeBuildVersion: '123' }, { version: '0.0.9', android: { versionCode: 88 } })
    ).toBe('v1.0.1 (123)');
  });

  it('falls back to expo config when native values are missing', () => {
    expect(loadVersionLabel({ nativeApplicationVersion: null, nativeBuildVersion: null }, { version: '1.2.3', android: { versionCode: 456 } })).toBe(
      'v1.2.3 (456)'
    );
  });

  it('falls back to dev build marker when build values are unavailable', () => {
    expect(loadVersionLabel({ nativeApplicationVersion: null, nativeBuildVersion: null }, { version: '2.0.0' })).toBe('v2.0.0 (dev)');
  });
});
