const { resolveBrandId, syncBrandArtifacts } = require('./lib/brand-config');

const brand = syncBrandArtifacts({
  brandId: resolveBrandId(),
});

process.stdout.write(`synced brand ${brand.id}: ${brand.productName} (${brand.android.package})\n`);
