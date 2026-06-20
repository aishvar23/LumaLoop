module.exports = function (api) {
  api.cache(true);
  return {
    // `babel-preset-expo` (SDK 56) AUTOMATICALLY appends the Reanimated worklets
    // Babel plugin (`react-native-worklets/plugin`, Reanimated v4's successor to
    // `react-native-reanimated/plugin`) as the LAST plugin whenever
    // `react-native-worklets` is installed — which `npx expo install
    // react-native-reanimated` brought in. Adding it here too would duplicate the
    // plugin and fail the build, so we rely on the preset's auto-inclusion per the
    // Reanimated + Expo docs. Listed explicitly here only as documentation.
    presets: ['babel-preset-expo'],
  };
};
