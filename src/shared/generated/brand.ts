import { resolveInstalledBrandId } from '../branding/installedBrand';

export const DEFAULT_BRAND_ID = "zenmind" as const;

export const APP_BRANDS = {
  "cutej": {
    "id": "cutej",
    "productName": "CuteJ",
    "expoName": "CuteJ",
    "slug": "cutej-react-app",
    "version": "2.0.0",
    "storageNamespace": "zenmind-app",
    "splash": {
      "backgroundColor": "#F5F7FA",
      "imageWidth": 220
    },
    "i18n": {
      "zh-CN": {
        "app.name": "CuteJ",
        "app.productName": "CuteJ"
      },
      "en-US": {
        "app.name": "CuteJ",
        "app.productName": "CuteJ"
      }
    }
  },
  "zenmind": {
    "id": "zenmind",
    "productName": "Zenmind",
    "expoName": "Zenmind",
    "slug": "zenmind-react-app",
    "version": "2.0.0",
    "storageNamespace": "zenmind-app",
    "splash": {
      "backgroundColor": "#EDF1F5",
      "imageWidth": 220
    },
    "i18n": {
      "zh-CN": {
        "app.name": "ZenMind",
        "app.productName": "ZenMind"
      },
      "en-US": {
        "app.name": "ZenMind",
        "app.productName": "ZenMind"
      }
    }
  }
} as const;

export type AppBrandId = keyof typeof APP_BRANDS;

export const INSTALLED_BRAND_ID = resolveInstalledBrandId(APP_BRANDS, DEFAULT_BRAND_ID);
export const APP_BRAND = APP_BRANDS[INSTALLED_BRAND_ID];

export const BRAND_ID = APP_BRAND.id;
export const PRODUCT_NAME = APP_BRAND.productName;
export const EXPO_NAME = APP_BRAND.expoName;
export const APP_SLUG = APP_BRAND.slug;
export const APP_VERSION = APP_BRAND.version;
export const STORAGE_NAMESPACE = APP_BRAND.storageNamespace;
export const BRAND_SPLASH_BACKGROUND_COLOR = APP_BRAND.splash.backgroundColor;
export const BRAND_SPLASH_IMAGE_WIDTH = APP_BRAND.splash.imageWidth;
