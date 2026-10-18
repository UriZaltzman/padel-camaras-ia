// Used by Metro and by Jest (babel-jest does not pick up Expo's implicit default).
module.exports = function (api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
