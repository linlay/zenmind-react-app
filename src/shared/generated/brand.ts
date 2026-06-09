export const APP_BRAND = {
  "id": "zenmind",
  "productName": "ZenMind",
  "expoName": "ZenMind",
  "slug": "zenmind-react-app",
  "version": "2.0.0",
  "storageNamespace": "zenmind-app",
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
} as const;

export const BRAND_ID = APP_BRAND.id;
export const PRODUCT_NAME = APP_BRAND.productName;
export const EXPO_NAME = APP_BRAND.expoName;
export const APP_SLUG = APP_BRAND.slug;
export const APP_VERSION = APP_BRAND.version;
export const STORAGE_NAMESPACE = APP_BRAND.storageNamespace;
