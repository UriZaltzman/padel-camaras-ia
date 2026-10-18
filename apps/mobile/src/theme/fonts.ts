// Brand fonts (OFL-1.1, license texts next to the files in assets/fonts).
// React Native needs one family name per weight, so each weight of the tokens' families
// (packages/ui fontFamily) is registered under its own name.
export const fonts = {
  displayExtraBold: 'Archivo_800ExtraBold',
  displayBlack: 'Archivo_900Black',
  body: 'IBMPlexSans_400Regular',
  bodyMedium: 'IBMPlexSans_500Medium',
  bodySemiBold: 'IBMPlexSans_600SemiBold',
  monoMedium: 'IBMPlexMono_500Medium',
} as const;

// Metro resolves font files only through require().
/* eslint-disable @typescript-eslint/no-require-imports */
export const fontAssets = {
  [fonts.displayExtraBold]: require('../../assets/fonts/Archivo_800ExtraBold.ttf'),
  [fonts.displayBlack]: require('../../assets/fonts/Archivo_900Black.ttf'),
  [fonts.body]: require('../../assets/fonts/IBMPlexSans_400Regular.ttf'),
  [fonts.bodyMedium]: require('../../assets/fonts/IBMPlexSans_500Medium.ttf'),
  [fonts.bodySemiBold]: require('../../assets/fonts/IBMPlexSans_600SemiBold.ttf'),
  [fonts.monoMedium]: require('../../assets/fonts/IBMPlexMono_500Medium.ttf'),
} as Record<string, number>;
/* eslint-enable @typescript-eslint/no-require-imports */
