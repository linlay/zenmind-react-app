import brandLogo_cutej from '../../../assets/brands/cutej/logo.png';
import brandLogo_zenmind from '../../../assets/brands/zenmind/logo.png';

import { DEFAULT_BRAND_ID, INSTALLED_BRAND_ID, type AppBrandId } from './brand';

export const BRAND_LOGOS = {
  "cutej": brandLogo_cutej,
  "zenmind": brandLogo_zenmind,
} as const;

export const BRAND_LOGO = BRAND_LOGOS[INSTALLED_BRAND_ID] || BRAND_LOGOS[DEFAULT_BRAND_ID];

export function getBrandLogo(brandId: AppBrandId) {
  return BRAND_LOGOS[brandId] || BRAND_LOGOS[DEFAULT_BRAND_ID];
}
