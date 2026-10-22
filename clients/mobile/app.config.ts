import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'AcceptCat 试用版',
  slug: 'acceptcat-mobile',
  version: '0.1.0',
  scheme: 'acceptcat-mobile',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  android: {
    package: 'com.acceptcat.mobile',
    versionCode: 1,
    allowBackup: false,
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: true,
    permissions: [],
    blockedPermissions: ['android.permission.RECORD_AUDIO', 'android.permission.SYSTEM_ALERT_WINDOW'],
  },
  ios: { bundleIdentifier: 'com.acceptcat.mobile', supportsTablet: true },
  plugins: [['expo-secure-store', { configureAndroidBackup: true }]],
};
export default config;
