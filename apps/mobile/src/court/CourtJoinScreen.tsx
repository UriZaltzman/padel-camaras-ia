// JG-08a: after scanning the court QR. Offers to join the current match, lets the player tap a
// spot on a mini court (side + drive/revés), applies the payment gate of the club's mode and
// lands on the match. Guests can join and claim their account later.
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, DataLabel } from '@app/ui/native';
import { theme } from '@app/ui/tokens';

import { useApi } from '../api/client';
import { useSession } from '../auth/session';
import { formatSlot } from '../home/home-data';
import { fonts } from '../theme/fonts';
import {
  allSpots,
  newIdempotencyKey,
  isTaken,
  joinOffer,
  needsPayment,
  spotPosition,
  useCourtSession,
  useJoinCourt,
  type CourtJoinService,
  type Spot,
} from './court-join';

const colors = theme.light;

const time = (iso: string) =>
  new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date(iso));

interface Props {
  courtId: string;
  /** Undefined in builds without a backend for the court QR: shows the "not available" state. */
  service?: CourtJoinService;
}

export function CourtJoinScreen({ courtId, service }: Props) {
  const { t } = useTranslation();
  if (!service) return <Message text={t('court.unavailable')} testID="court-unavailable" />;
  return <Loaded courtId={courtId} service={service} />;
}

function Message({ text, testID }: { text: string; testID: string }) {
  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.body} testID={testID}>
        {text}
      </Text>
    </SafeAreaView>
  );
}

function Loaded({ courtId, service }: { courtId: string; service: CourtJoinService }) {
  const { t } = useTranslation();
  const router = useRouter();
  const api = useApi();
  const { user } = useSession();
  const session = useCourtSession(service, courtId);
  const join = useJoinCourt(service, courtId);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [payError, setPayError] = useState(false);
  const payKey = useRef(newIdempotencyKey());

  if (session.isPending) return <Message text={t('court.loading')} testID="court-loading" />;
  if (session.isError) return <Message text={t('court.error')} testID="court-error" />;
  const s = session.data;
  const offer = joinOffer(s);
  if (offer.kind === 'off') return <Message text={t('court.off')} testID="court-off" />;
  if (offer.kind === 'none') return <Message text={t('court.none')} testID="court-none" />;

  const matchId = s.booking?.match_id ?? null;
  const gate = needsPayment(s);
  const title = s.booking
    ? t('court.offer', { time: time(s.booking.starts_at) })
    : t('court.freeSession');

  async function pay() {
    if (!matchId) return;
    setPayError(false);
    const { data, error } = await api.POST('/payments/checkout', {
      params: { header: { 'Idempotency-Key': payKey.current } },
      body: { concept: 'player_extra', match_id: matchId },
    });
    if (error) setPayError(true);
    else await Linking.openURL(data.checkout_url);
  }

  function confirm() {
    if (!spot) return;
    join.mutate(spotPosition(spot), {
      onSuccess: ({ match_id }) => router.replace(`/match/${match_id}`),
    });
  }

  return (
    <SafeAreaView style={styles.screen} testID="court-screen">
      <View style={styles.content}>
        <DataLabel label={t('court.label', { club: s.club.name, court: s.court.name })} />
        <Text style={styles.title} testID="court-offer">
          {title}
        </Text>
        {s.booking ? <Text style={styles.body}>{formatSlot(s.booking.starts_at)}</Text> : null}
        <Card>
          <View style={styles.court} testID="court-mini">
            {allSpots.map((p) => {
              const taken = isTaken(s, p);
              const selected = spot?.team === p.team && spot.side === p.side;
              const n = spotPosition(p);
              return (
                <Pressable
                  key={n}
                  testID={`court-spot-${n}`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: taken, selected }}
                  accessibilityLabel={t(`court.spot.${p.side}`, { team: p.team })}
                  disabled={taken}
                  onPress={() => setSpot(p)}
                  style={[styles.spot, taken && styles.taken, selected && styles.selected]}
                >
                  <Text style={styles.body}>{t(`court.spot.${p.side}`, { team: p.team })}</Text>
                  {taken ? <Text style={styles.small}>{t('court.taken')}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        </Card>
        {user ? null : (
          <Text style={styles.body} testID="court-guest">
            {t('court.guest')}
          </Text>
        )}
        {gate ? (
          <Card>
            <View style={styles.gap} testID="court-gate">
              <Text style={styles.body}>
                {t('court.gate', { price: ((s.extra_amount_cents ?? 0) / 100).toFixed(0) })}
              </Text>
              <Button label={t('court.pay')} onPress={() => void pay()} testID="court-pay" />
              {payError ? <Text style={styles.body}>{t('court.payError')}</Text> : null}
            </View>
          </Card>
        ) : (
          <Button
            label={t('court.join')}
            testID="court-join"
            disabled={!spot || join.isPending}
            onPress={confirm}
          />
        )}
        {join.isError ? (
          <Text style={styles.body} testID="court-join-error">
            {t(`court.error_${join.error.message}`, { defaultValue: t('court.joinError') })}
          </Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: 16 },
  content: { gap: 12 },
  title: { fontFamily: fonts.displayExtraBold, fontSize: 24, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary },
  small: { fontFamily: fonts.body, fontSize: 12, color: colors.textTertiary },
  gap: { gap: 8 },
  court: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  spot: {
    width: '48%',
    minHeight: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.textTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taken: { opacity: 0.4 },
  selected: { borderColor: colors.text, borderWidth: 2 },
});
