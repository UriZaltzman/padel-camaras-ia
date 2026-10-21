// Home: the next booking and the last published match of the signed-in user (spec §16).
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, DataLabel } from '@app/ui/native';
import { theme } from '@app/ui/tokens';

import { fonts } from '../theme/fonts';
import {
  formatSets,
  formatSlot,
  useLastMatch,
  useNextBooking,
  type NextBookingLoader,
} from './home-data';

const colors = theme.light;

const noNextBooking: NextBookingLoader = () => Promise.resolve(null);

interface HomeScreenProps {
  /** Source of the next booking until the contract has a "my bookings" endpoint. */
  loadNextBooking?: NextBookingLoader;
}

export function HomeScreen({ loadNextBooking = noNextBooking }: HomeScreenProps) {
  const { t } = useTranslation();
  const booking = useNextBooking(loadNextBooking);
  const match = useLastMatch();

  return (
    <SafeAreaView style={styles.screen} testID="home-screen">
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.dataLabel}>{t('home.dataLabel')}</Text>
        <Text style={styles.title}>{t('home.title')}</Text>

        <Card style={styles.card}>
          <View testID="home-next-booking" style={styles.cardBody}>
            <DataLabel label={t('home.nextBooking.label')} />
            {booking.isPending ? (
              <Text style={styles.muted}>{t('home.loading')}</Text>
            ) : booking.isError ? (
              <Text style={styles.muted}>{t('home.error')}</Text>
            ) : booking.data ? (
              <>
                <Text style={styles.headline} testID="home-next-booking-slot">
                  {formatSlot(booking.data.starts_at)}
                </Text>
                <Text style={styles.body}>
                  {t('home.nextBooking.place', {
                    club: booking.data.club.name,
                    court: booking.data.court.name,
                    minutes: booking.data.duration_minutes,
                  })}
                </Text>
              </>
            ) : (
              <Text style={styles.muted} testID="home-next-booking-empty">
                {t('home.nextBooking.empty')}
              </Text>
            )}
          </View>
        </Card>

        <Card style={styles.card}>
          <View testID="home-last-match" style={styles.cardBody}>
            <DataLabel label={t('home.lastMatch.label')} />
            {match.isPending ? (
              <Text style={styles.muted}>{t('home.loading')}</Text>
            ) : match.isError ? (
              <Text style={styles.muted}>{t('home.error')}</Text>
            ) : match.data ? (
              <>
                <Text style={styles.headline} testID="home-last-match-result">
                  {match.data.won ? t('home.lastMatch.won') : t('home.lastMatch.lost')}
                  {'  '}
                  <Text style={styles.score}>{formatSets(match.data.sets, match.data.team)}</Text>
                </Text>
                <Text style={styles.body}>
                  {t('home.lastMatch.place', {
                    club: match.data.club.name,
                    court: match.data.court.name,
                    when: formatSlot(match.data.starts_at),
                  })}
                </Text>
              </>
            ) : (
              <Text style={styles.muted} testID="home-last-match-empty">
                {t('home.lastMatch.empty')}
              </Text>
            )}
          </View>
        </Card>
      </ScrollView>
      {/* Navigation to the booking flow arrives with its own issue. */}
      <Button label={t('home.primaryAction')} testID="home-primary-action" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: 24 },
  content: { gap: 16, paddingBottom: 24 },
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
  card: { width: '100%' },
  cardBody: { gap: 8 },
  headline: {
    fontFamily: fonts.displayExtraBold,
    fontSize: 22,
    letterSpacing: 22 * -0.02,
    color: colors.text,
  },
  score: { fontFamily: fonts.monoMedium, fontSize: 18, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: 16, color: colors.textSecondary },
  muted: { fontFamily: fonts.body, fontSize: 16, color: colors.textTertiary },
});
