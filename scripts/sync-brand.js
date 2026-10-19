const { resolveBrandId, syncBrandArtifacts } = require('./lib/brand-config');
const { syncReactAppEnvArtifact } = require('./lib/app-env-config');

const brand = syncBrandArtifacts({
  brandId: resolveBrandId(),
});
const appEnv = syncReactAppEnvArtifact();

process.stdout.write(
  `synced brand ${brand.id}: ${brand.productName} (${brand.android.package}), app env ${appEnv.artifactVersion}\n`
);
