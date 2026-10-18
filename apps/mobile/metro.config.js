// Expo's Metro config detects the pnpm workspace on its own (SDK 52+) and supports pnpm's
// isolated node_modules (SDK 54+), so no watchFolders / nodeModulesPaths overrides are needed.
// Kept explicit so monorepo tweaks have a home inside apps/mobile instead of the repo root.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
