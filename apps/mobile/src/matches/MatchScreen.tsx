// Match screen (spec §16, JG-08b): video with a point timeline, score, jumps to won or lost
// points, approximate stats and download.
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, DataLabel } from '@app/ui/native';
import { theme } from '@app/ui/tokens';

import { useApi } from '../api/client';
import { useSession } from '../auth/session';
import { formatSets, formatSlot } from '../home/home-data';
import { fonts } from '../theme/fonts';
import {
  filterPoints,
  formatDuration,
  statsAreApproximate,
  teamOf,
  useMatch,
  useMatchClips,
  useSignedUrl,
  type PointFilter,
} from './match-data';
import { MatchVideo, type MatchVideoComponent } from './MatchVideo';

const colors = theme.light;
const FILTERS: PointFilter[] = ['all', 'won', 'lost'];

interface Props {
  matchId: string;
  /** Injected in tests; the real player needs the native module. */
  Video?: MatchVideoComponent;
}

export function MatchScreen({ matchId, Video = MatchVideo }: Props) {
  const { t } = useTranslation();
  const api = useApi();
  const { user } = useSession();
  const match = useMatch(matchId);
  const clips = useMatchClips(matchId);
  // What the player shows: the full video or a clip of one point, from a given offset.
  const [source, setSource] = useState<{ mediaId: string | null; startMs: number; key: number }>({
    mediaId: null,
    startMs: 0,
    key: 0,
  });
  const [filter, setFilter] = useState<PointFilter>('all');
  const [downloadNote, setDownloadNote] = useState<string | null>(null);

  const fullId = match.data?.full_video?.id ?? null;
  const mediaId = source.mediaId ?? fullId;
  const signed = useSignedUrl(mediaId);

  const download = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await api.POST('/media/{id}/download', {
        params: { path: { id } },
      });
      if (error) throw new Error(error.code);
      return data;
    },
    onSuccess: (d) => {
      if (d.status === 'ready' && d.url) {
        setDownloadNote(null);
        void Linking.openURL(d.url);
      } else setDownloadNote(t('match.download.preparing'));
    },
    onError: () => setDownloadNote(t('match.download.error')),
  });

  if (match.isPending) {
    return (
      <SafeAreaView style={styles.screen} testID="match-screen">
        <Text style={styles.muted}>{t('match.loading')}</Text>
      </SafeAreaView>
    );
  }
  if (match.isError) {
    return (
      <SafeAreaView style={styles.screen} testID="match-screen">
        <Text style={styles.muted} testID="match-error">
          {t('match.error')}
        </Text>
      </SafeAreaView>
    );
  }

  const m = match.data;
  const team = teamOf(m, user?.id ?? null);
  const points = filterPoints(m.points_to_review, team, filter);
  const jump = (id: string | null, startMs: number) =>
    id && setSource((s) => ({ mediaId: id, startMs, key: s.key + 1 }));
  const mine = m.players.find((p) => p.user?.id === user?.id)?.stats ?? null;
  const approx = statsAreApproximate(m);

  return (
    <SafeAreaView style={styles.screen} testID="match-screen">
      <ScrollView contentContainerStyle={styles.content}>
        {signed.data ? (
          <Video uri={signed.data.url} startMs={source.startMs} seekKey={source.key} />
        ) : (
          <View style={styles.videoPlaceholder} testID="match-video-placeholder">
            <Text style={styles.mutedOnDark}>
              {fullId === null
                ? t('match.video.unavailable')
                : signed.isError
                  ? t('match.video.error')
                  : t('match.loading')}
            </Text>
          </View>
        )}
        {source.mediaId !== null && fullId !== null ? (
          <Button
            variant="secondary"
            label={t('match.video.backToFull')}
            testID="match-back-to-full"
            onPress={() => setSource((s) => ({ mediaId: null, startMs: 0, key: s.key + 1 }))}
          />
        ) : null}

        <Card>
          <View style={styles.cardBody} testID="match-score">
            <DataLabel label={t('match.score.label')} />
            <Text style={styles.headline}>
              {m.winner_team === null
                ? t('match.score.pending')
                : m.winner_team === team
                  ? t('match.score.won')
                  : t('match.score.lost')}
              {'  '}
              <Text style={styles.score}>{formatSets(m.sets, team)}</Text>
            </Text>
            <Text style={styles.body}>
              {t('match.place', {
                club: m.club.name,
                court: m.court.name,
                when: formatSlot(m.starts_at),
              })}
            </Text>
          </View>
        </Card>

        <Card>
          <View style={styles.cardBody} testID="match-timeline">
            <DataLabel label={t('match.timeline.label')} />
            <View style={styles.row}>
              {FILTERS.map((f) => (
                <Pressable
                  key={f}
                  testID={`match-filter-${f}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: filter === f }}
                  onPress={() => setFilter(f)}
                  style={[styles.chip, filter === f && styles.chipOn]}
                >
                  <Text style={[styles.chipText, filter === f && styles.chipTextOn]}>
                    {t(`match.timeline.filter.${f}`)}
                  </Text>
                </Pressable>
              ))}
            </View>
            {points.length === 0 ? (
              <Text style={styles.muted} testID="match-timeline-empty">
                {t('match.timeline.empty')}
              </Text>
            ) : (
              points.map((p) => (
                <Pressable
                  key={p.id}
                  testID={`match-point-${p.number}`}
                  accessibilityRole="button"
                  disabled={p.clip_media_id === null}
                  onPress={() => jump(p.clip_media_id, 0)}
                  style={styles.point}
                >
                  <Text style={styles.body}>
                    {t('match.timeline.point', { number: p.number, set: p.set, game: p.game })}
                  </Text>
                  <Text style={p.winner_team === team ? styles.wonText : styles.lostText}>
                    {p.winner_team === team ? t('match.timeline.won') : t('match.timeline.lost')}
                  </Text>
                </Pressable>
              ))
            )}
            {fullId !== null && clips.data && clips.data.length > 0 ? (
              <>
                <DataLabel label={t('match.timeline.clips')} />
                {clips.data.map((c, i) => (
                  <Pressable
                    key={c.id}
                    testID={`match-clip-${i}`}
                    accessibilityRole="button"
                    onPress={() => jump(fullId, c.start_ms)}
                    style={styles.point}
                  >
                    <Text style={styles.body}>{t('match.timeline.clip', { n: i + 1 })}</Text>
                    <Text style={styles.score}>{formatDuration(c.start_ms)}</Text>
                  </Pressable>
                ))}
              </>
            ) : null}
          </View>
        </Card>

        {mine ? (
          <Card>
            <View style={styles.cardBody} testID="match-stats">
              <DataLabel label={t('match.stats.label')} />
              {approx ? (
                <Text style={styles.approx} testID="match-stats-approx">
                  {t('match.stats.approx')}
                </Text>
              ) : null}
              <Text style={styles.body}>
                {t('match.stats.summary', {
                  won: mine.points_won,
                  winners: mine.winners,
                  errors: mine.unforced_errors,
                })}
              </Text>
            </View>
          </Card>
        ) : null}

        {fullId !== null ? (
          <View style={styles.cardBody}>
            <Button
              label={t('match.download.action')}
              testID="match-download"
              disabled={download.isPending}
              onPress={() => download.mutate(fullId)}
            />
            {downloadNote ? (
              <Text style={styles.muted} testID="match-download-note">
                {downloadNote}
              </Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: 24 },
  content: { gap: 16, paddingBottom: 24 },
  videoPlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.textTertiary,
  },
  chipOn: { backgroundColor: colors.text },
  chipText: { fontFamily: fonts.body, fontSize: 14, color: colors.text },
  chipTextOn: { color: colors.background },
  point: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  headline: {
    fontFamily: fonts.displayExtraBold,
    fontSize: 22,
    letterSpacing: 22 * -0.02,
    color: colors.text,
  },
  score: { fontFamily: fonts.monoMedium, fontSize: 18, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: 16, color: colors.textSecondary },
  muted: { fontFamily: fonts.body, fontSize: 16, color: colors.textTertiary },
  mutedOnDark: { fontFamily: fonts.body, fontSize: 16, color: '#fff' },
  approx: { fontFamily: fonts.monoMedium, fontSize: 12, color: colors.textSecondary },
  wonText: { fontFamily: fonts.monoMedium, fontSize: 14, color: colors.text },
  lostText: { fontFamily: fonts.monoMedium, fontSize: 14, color: colors.textTertiary },
});
