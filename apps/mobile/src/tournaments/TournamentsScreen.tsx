// JG-07: tournaments of the club, the detail with registration, fixture, group standings and the
// next match of the player. Hidden behind the club's `tournaments` module.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, DataLabel } from '@app/ui/native';
import { theme } from '@app/ui/tokens';

import { useSession } from '../auth/session';
import { formatSlot } from '../home/home-data';
import { fonts } from '../theme/fonts';
import {
  ApiCodeError,
  FEATURE_DISABLED,
  canRegister,
  groupLetter,
  myPair,
  nextMatch,
  pairName,
  usePartnerSearch,
  useRegister,
  useTournament,
  useTournaments,
  type Partner,
  type PartnerFinder,
  type TournamentDetail,
} from './tournament-data';

const colors = theme.light;

function Message({ text, testID }: { text: string; testID: string }) {
  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.body} testID={testID}>
        {text}
      </Text>
    </SafeAreaView>
  );
}

const money = (cents: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(cents / 100);

function failure(error: unknown, t: (k: string) => string, testID: string) {
  if (error instanceof ApiCodeError && error.code === FEATURE_DISABLED) {
    return <Message text={t('tournaments.disabled')} testID="tournaments-disabled" />;
  }
  return <Message text={t('tournaments.error')} testID={testID} />;
}

export function TournamentsScreen({ clubId }: { clubId: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const list = useTournaments(clubId);
  if (list.isPending)
    return <Message text={t('tournaments.loading')} testID="tournaments-loading" />;
  if (list.isError) return failure(list.error, t, 'tournaments-error');
  return (
    <SafeAreaView style={styles.screen} testID="tournaments-screen">
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t('tournaments.title')}</Text>
        {list.data.length === 0 && (
          <Text style={styles.body} testID="tournaments-empty">
            {t('tournaments.empty')}
          </Text>
        )}
        {list.data.map((item) => (
          <Pressable
            key={item.id}
            testID={`tournament-${item.id}`}
            accessibilityRole="button"
            onPress={() => router.push(`/tournaments/${clubId}/${item.id}`)}
          >
            <Card style={styles.card}>
              <View style={styles.gap}>
                <DataLabel label={t(`tournaments.status.${item.status}`)} />
                <Text style={styles.headline}>{item.name}</Text>
                <Text style={styles.body}>
                  {t('tournaments.summary', {
                    category: item.category,
                    pairs: item.pair_count,
                    fee:
                      item.entry_fee_cents > 0
                        ? money(item.entry_fee_cents)
                        : t('tournaments.free'),
                  })}
                </Text>
              </View>
            </Card>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

interface DetailProps {
  clubId: string;
  tournamentId: string;
  /** Undefined in builds without a user search: registration shows "not available". */
  finder?: PartnerFinder;
}

export function TournamentDetailScreen({ clubId, tournamentId, finder }: DetailProps) {
  const { t } = useTranslation();
  const { user } = useSession();
  const query = useTournament(clubId, tournamentId);
  if (query.isPending)
    return <Message text={t('tournaments.loading')} testID="tournament-loading" />;
  if (query.isError) return failure(query.error, t, 'tournament-error');
  const detail = query.data;
  const mine = user ? myPair(detail, user.id) : undefined;
  return (
    <SafeAreaView style={styles.screen} testID="tournament-screen">
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{detail.name}</Text>
        <Text style={styles.body}>
          {t('tournaments.summary', {
            category: detail.category,
            pairs: detail.pair_count,
            fee: detail.entry_fee_cents > 0 ? money(detail.entry_fee_cents) : t('tournaments.free'),
          })}
        </Text>

        {mine && <MyStatus detail={detail} pairId={mine.id} paid={mine.paid} />}
        {canRegister(detail, !!mine) && (
          <RegisterForm clubId={clubId} detail={detail} finder={finder} />
        )}
        {detail.groups.length > 0 && <Standings detail={detail} />}
        {detail.matches.length > 0 && <Fixture detail={detail} pairId={mine?.id} />}
      </ScrollView>
    </SafeAreaView>
  );
}

function MyStatus({
  detail,
  pairId,
  paid,
}: {
  detail: TournamentDetail;
  pairId: string;
  paid: boolean;
}) {
  const { t } = useTranslation();
  const next = nextMatch(detail, pairId);
  const rival = next
    ? pairName(detail, next.pair_a_id === pairId ? next.pair_b_id : next.pair_a_id)
    : null;
  return (
    <Card style={styles.card}>
      <View style={styles.gap} testID="tournament-mine">
        <DataLabel label={t('tournaments.mine.label')} />
        <Text style={styles.body}>
          {t('tournaments.mine.registered', { pair: pairName(detail, pairId) })}
        </Text>
        {detail.entry_fee_cents > 0 && !paid && (
          <Text style={styles.body} testID="tournament-pay-at-club">
            {t('tournaments.mine.payAtClub', { fee: money(detail.entry_fee_cents) })}
          </Text>
        )}
        {next ? (
          <Text style={styles.headline} testID="tournament-next-match">
            {t('tournaments.mine.next', {
              when: formatSlot(next.starts_at),
              rival: rival ?? t('tournaments.toBeDefined'),
            })}
          </Text>
        ) : detail.status !== 'registration' ? (
          <Text style={styles.body}>{t('tournaments.mine.noNext')}</Text>
        ) : null}
      </View>
    </Card>
  );
}

function RegisterForm({
  clubId,
  detail,
  finder,
}: {
  clubId: string;
  detail: TournamentDetail;
  finder?: PartnerFinder;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [partner, setPartner] = useState<Partner | null>(null);
  const results = usePartnerSearch(finder, text);
  const register = useRegister(clubId, detail.id);
  if (!finder) {
    return (
      <Text style={styles.body} testID="tournament-register-unavailable">
        {t('tournaments.register.unavailable')}
      </Text>
    );
  }
  const errorCode = register.error instanceof ApiCodeError ? register.error.code : null;
  return (
    <Card style={styles.card}>
      <View style={styles.gap} testID="tournament-register">
        <DataLabel label={t('tournaments.register.label')} />
        <Text style={styles.body}>
          {t('tournaments.register.category', { category: detail.category })}
        </Text>
        <TextInput
          testID="tournament-partner-input"
          style={styles.input}
          value={partner ? partner.name : text}
          onChangeText={(v) => {
            setPartner(null);
            setText(v);
          }}
          placeholder={t('tournaments.register.partnerPlaceholder')}
          autoCapitalize="words"
        />
        {!partner &&
          results.data?.map((p) => (
            <Pressable
              key={p.user_id}
              testID={`partner-${p.user_id}`}
              accessibilityRole="button"
              onPress={() => setPartner(p)}
            >
              <Text style={styles.option}>{p.name}</Text>
            </Pressable>
          ))}
        {detail.entry_fee_cents > 0 && (
          <Text style={styles.small}>
            {t('tournaments.register.fee', { fee: money(detail.entry_fee_cents) })}
          </Text>
        )}
        {errorCode && (
          <Text style={styles.error} testID="tournament-register-error">
            {t(`tournaments.register.error_${errorCode}`, {
              defaultValue: t('tournaments.register.error'),
            })}
          </Text>
        )}
        <Button
          testID="tournament-register-submit"
          label={t('tournaments.register.submit')}
          disabled={!partner || register.isPending}
          onPress={() => partner && register.mutate(partner.user_id)}
        />
      </View>
    </Card>
  );
}

function Standings({ detail }: { detail: TournamentDetail }) {
  const { t } = useTranslation();
  return (
    <View style={styles.gap} testID="tournament-standings">
      {detail.groups.map((g) => (
        <Card key={g.id} style={styles.card}>
          <View style={styles.gap}>
            <DataLabel label={t('tournaments.group', { letter: groupLetter(g.position) })} />
            {g.standings.map((s, i) => (
              <Text key={s.pair_id} style={styles.body} testID={`standing-${s.pair_id}`}>
                {t('tournaments.standingRow', {
                  pos: i + 1,
                  pair: pairName(detail, s.pair_id),
                  played: s.played,
                  wins: s.wins,
                })}
              </Text>
            ))}
          </View>
        </Card>
      ))}
    </View>
  );
}

function Fixture({ detail, pairId }: { detail: TournamentDetail; pairId?: string }) {
  const { t } = useTranslation();
  return (
    <View style={styles.gap} testID="tournament-fixture">
      <DataLabel label={t('tournaments.fixture')} />
      {detail.matches.map((m) => {
        const mineRow = !!pairId && (m.pair_a_id === pairId || m.pair_b_id === pairId);
        return (
          <Card key={m.id} style={styles.card}>
            <View style={styles.gap} testID={`fixture-${m.id}`}>
              <Text style={[styles.small, mineRow && styles.mine]}>
                {t(`tournaments.stage.${m.stage}`)} · {formatSlot(m.starts_at)}
              </Text>
              <Text style={styles.body}>
                {pairName(detail, m.pair_a_id) ?? t('tournaments.toBeDefined')} vs{' '}
                {pairName(detail, m.pair_b_id) ?? t('tournaments.toBeDefined')}
              </Text>
              {m.sets && m.status === 'confirmed' && (
                <Text style={styles.score}>
                  {m.sets.map((s) => `${s.team_1}-${s.team_2}`).join(' ')}
                </Text>
              )}
            </View>
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: 16 },
  content: { gap: 12, paddingBottom: 24 },
  title: { fontFamily: fonts.displayExtraBold, fontSize: 28, color: colors.text },
  headline: { fontFamily: fonts.displayExtraBold, fontSize: 18, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary },
  small: { fontFamily: fonts.body, fontSize: 12, color: colors.textTertiary },
  mine: { color: colors.text },
  score: { fontFamily: fonts.monoMedium, fontSize: 16, color: colors.text },
  error: { fontFamily: fonts.body, fontSize: 14, color: colors.text },
  card: { width: '100%' },
  gap: { gap: 8 },
  option: { fontFamily: fonts.body, fontSize: 16, color: colors.text, paddingVertical: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.textTertiary,
    borderRadius: 8,
    padding: 12,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.text,
  },
});
