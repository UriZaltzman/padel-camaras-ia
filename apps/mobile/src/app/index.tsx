import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@app/ui/tokens';

import { fonts } from '../theme/fonts';

const colors = theme.light;

export default function HomeScreen() {
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.screen} testID="home-screen">
      <View style={styles.content}>
        <Text style={styles.dataLabel}>{t('home.dataLabel')}</Text>
        <Text style={styles.title}>{t('home.title')}</Text>
        <Text style={styles.subtitle}>{t('home.subtitle')}</Text>
        <Text style={styles.body}>{t('home.body')}</Text>
      </View>
      {/* Navigation to the booking flow arrives with its own issue. */}
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        testID="home-primary-action"
      >
        <Text style={styles.buttonText}>{t('home.primaryAction')}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: 24 },
  content: { flex: 1, justifyContent: 'center', gap: 12 },
  dataLabel: {
    fontFamily: fonts.monoMedium,
    fontSize: 12,
    letterSpacing: 12 * 0.12,
    textTransform: 'uppercase',
    color: colors.textTertiary,
  },
  title: {
    fontFamily: fonts.displayBlack,
    fontSize: 48,
    letterSpacing: 48 * -0.02,
    color: colors.text,
  },
  subtitle: {
    fontFamily: fonts.displayExtraBold,
    fontSize: 24,
    letterSpacing: 24 * -0.02,
    color: colors.text,
  },
  body: { fontFamily: fonts.body, fontSize: 16, color: colors.textSecondary },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonPressed: { backgroundColor: colors.primaryPressed },
  buttonText: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: colors.onPrimary },
});
