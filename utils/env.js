// ponytail: React Native environment detection. __DEV__ is built into RN.
export const isDev = __DEV__;
export const isProd = !__DEV__;
export const isTest = false;
export const mode = __DEV__ ? 'development' : 'production';