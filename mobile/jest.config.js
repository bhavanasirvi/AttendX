module.exports = {
  preset: '@react-native/jest-preset',
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|@react-native-async-storage|@react-native-community|react-native-safe-area-context|react-native-screens|react-native-gesture-handler|react-native-geolocation-service|react-native-vision-camera)/)',
  ],
};
