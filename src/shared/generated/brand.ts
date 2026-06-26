export const APP_BRAND = {
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
} as const;

export const BRAND_ID = APP_BRAND.id;
export const PRODUCT_NAME = APP_BRAND.productName;
export const EXPO_NAME = APP_BRAND.expoName;
export const APP_SLUG = APP_BRAND.slug;
export const APP_VERSION = APP_BRAND.version;
export const STORAGE_NAMESPACE = APP_BRAND.storageNamespace;
export const BRAND_SPLASH_BACKGROUND_COLOR = APP_BRAND.splash.backgroundColor;
export const BRAND_SPLASH_IMAGE_WIDTH = APP_BRAND.splash.imageWidth;
