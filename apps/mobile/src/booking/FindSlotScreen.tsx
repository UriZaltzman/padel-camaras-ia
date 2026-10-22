// Find a club and a free slot (issue #86): search clubs with GET /clubs, open one with
// GET /clubs/{id}, pick a duration (60, 90 or 120) and a day within the player booking horizon,
// and list the free starts of every active court with GET /courts/{id}/availability.
// Picking a slot hands it to `onSelectSlot`; holding and paying it belongs to the booking issue.
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Schema } from '@app/contracts';
import { Button, DataLabel } from '@app/ui/native';
import { color, theme } from '@app/ui/tokens';

import { useApi } from '../api/client';
import { defaultLocale } from '../i18n';
import { fonts } from '../theme/fonts';
import { ClubExplorer } from './ClubExplorer';
import type { ClubResultsView } from './ClubResults';
import {
  BookingApiError,
  DURATIONS,
  bookableCourts,
  bookableDates,
  errorKey,
  formatDay,
  formatPrice,
  formatTime,
  type BookingDuration,
} from './find-slot';

const colors = theme.light;
const MIN_QUERY = 2;
const MAX_RETRIES = 2;

/** Contract errors are final answers; only network failures are retried. */
const retry = (failures: number, error: unknown) =>
  !(error instanceof BookingApiError) && failures < MAX_RETRIES;

export interface SelectedSlot {
  club: Schema<'Club'>;
  court: Schema<'Court'>;
  durationMinutes: BookingDuration;
  slot: Schema<'AvailabilitySlot'>;
}

interface FindSlotScreenProps {
  /** Replaces the club explorer (map, filters and list), for example in tests. */
  Results?: ClubResultsView;
  onSelectSlot?: (selected: SelectedSlot) => void;
  /** Injected in tests to pin "today". */
  now?: () => Date;
}

function ErrorText({ error }: { error: unknown }) {
  const { t } = useTranslation();
  return (
    <Text style={styles.error} testID="find-slot-error">
      {t(errorKey(error))}
    </Text>
  );
}

export function FindSlotScreen({ Results, onSelectSlot, now }: FindSlotScreenProps) {
  const { t } = useTranslation();
  const api = useApi();
  const [query, setQuery] = useState('');
  const [clubId, setClubId] = useState<string | null>(null);
  const [duration, setDuration] = useState<BookingDuration>(90);
  const [dates] = useState(() => bookableDates(now?.() ?? new Date()));
  const [date, setDate] = useState(dates[0] ?? '');
  const [selected, setSelected] = useState<SelectedSlot | null>(null);

  const search = query.trim();
  const clubs = useQuery({
    queryKey: ['clubs', search.length >= MIN_QUERY ? search : ''],
    queryFn: async () => {
      const q = search.length >= MIN_QUERY ? search : undefined;
      const { data, error } = await api.GET('/clubs', { params: { query: { q } } });
      if (!data) throw new BookingApiError(error?.code ?? 'INTERNAL_ERROR');
      return data.items;
    },
    enabled: clubId === null,
    // Typing in the search keeps the explorer (and its filters) mounted while results reload.
    placeholderData: keepPreviousData,
    retry,
  });

  const club = useQuery({
    queryKey: ['club', clubId],
    queryFn: async () => {
      const { data, error } = await api.GET('/clubs/{id}', {
        params: { path: { id: clubId ?? '' } },
      });
      if (!data) throw new BookingApiError(error?.code ?? 'INTERNAL_ERROR');
      return data;
    },
    enabled: clubId !== null,
    retry,
  });

  const courts = club.data ? bookableCourts(club.data) : [];
  const availability = useQueries({
    queries: courts.map((court) => ({
      queryKey: ['availability', court.id, date, duration],
      queryFn: async () => {
        const { data, error } = await api.GET('/courts/{id}/availability', {
          params: { path: { id: court.id }, query: { date, duration_minutes: duration } },
        });
        if (!data) throw new BookingApiError(error?.code ?? 'INTERNAL_ERROR');
        return data;
      },
      retry,
    })),
  });

  function pick(next: SelectedSlot) {
    setSelected(next);
    onSelectSlot?.(next);
  }

  if (clubId === null) {
    return (
      <SafeAreaView style={styles.screen} testID="find-slot-screen">
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <DataLabel label={t('findSlot.dataLabel')} />
          <Text style={styles.title}>{t('findSlot.title')}</Text>
          <TextInput
            accessibilityLabel={t('findSlot.searchLabel')}
            placeholder={t('findSlot.searchPlaceholder')}
            placeholderTextColor={colors.textTertiary}
            value={query}
            onChangeText={setQuery}
            style={styles.input}
            testID="club-search"
          />
          {clubs.isPending && <ActivityIndicator color={colors.primary} />}
          {clubs.isError && <ErrorText error={clubs.error} />}
          {clubs.data?.length === 0 && (
            <Text style={styles.body} testID="club-empty">
              {t('findSlot.noClubs')}
            </Text>
          )}
          {clubs.data && clubs.data.length > 0 && Results && (
            <Results
              clubs={clubs.data}
              onSelect={(c) => {
                setSelected(null);
                setClubId(c.id);
              }}
            />
          )}
          {clubs.data && clubs.data.length > 0 && !Results && (
            <ClubExplorer
              dates={dates}
              clubs={clubs.data}
              onSelect={(c) => {
                setSelected(null);
                setClubId(c.id);
              }}
            />
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} testID="club-slots-screen">
      <ScrollView contentContainerStyle={styles.content}>
        <Button
          label={t('findSlot.back')}
          variant="secondary"
          onPress={() => {
            setClubId(null);
            setSelected(null);
          }}
          testID="club-back"
          style={styles.back}
        />
        {club.isPending && <ActivityIndicator color={colors.primary} />}
        {club.isError && <ErrorText error={club.error} />}
        {club.data && (
          <>
            <Text style={styles.title}>{club.data.name}</Text>
            <Text style={styles.body}>{club.data.address}</Text>

            <DataLabel label={t('findSlot.duration')} />
            <View style={styles.chips} accessibilityRole="radiogroup">
              {DURATIONS.map((d) => (
                <Button
                  key={d}
                  label={t('findSlot.minutes', { minutes: d })}
                  variant={duration === d ? 'primary' : 'secondary'}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: duration === d }}
                  onPress={() => {
                    setDuration(d);
                    setSelected(null);
                  }}
                  testID={`duration-${d}`}
                  style={styles.chip}
                />
              ))}
            </View>

            <DataLabel label={t('findSlot.day')} />
            <ScrollView horizontal contentContainerStyle={styles.chips}>
              {dates.map((d) => (
                <Button
                  key={d}
                  label={formatDay(d, defaultLocale)}
                  variant={date === d ? 'primary' : 'secondary'}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: date === d }}
                  onPress={() => {
                    setDate(d);
                    setSelected(null);
                  }}
                  testID={`date-${d}`}
                  style={styles.chip}
                />
              ))}
            </ScrollView>

            {courts.length === 0 && (
              <Text style={styles.body} testID="no-courts">
                {t('findSlot.noCourts')}
              </Text>
            )}
            {courts.map((court, i) => {
              const result = availability[i];
              const slots = result?.data?.slots ?? [];
              return (
                <View key={court.id} style={styles.court} testID={`court-${court.id}`}>
                  <Text style={styles.courtName}>{court.name}</Text>
                  {result?.isPending && <ActivityIndicator color={colors.primary} />}
                  {result?.isError && <ErrorText error={result.error} />}
                  {result?.data && slots.length === 0 && (
                    <Text style={styles.body}>{t('findSlot.noSlots')}</Text>
                  )}
                  <View style={styles.chips}>
                    {slots.map((slot, j) => {
                      const isSelected =
                        selected?.court.id === court.id &&
                        selected.slot.starts_at === slot.starts_at;
                      return (
                        <Button
                          key={slot.starts_at}
                          label={formatTime(slot.starts_at, club.data.timezone, defaultLocale)}
                          variant={isSelected ? 'primary' : 'secondary'}
                          accessibilityState={{ selected: isSelected }}
                          onPress={() =>
                            pick({ club: club.data, court, durationMinutes: duration, slot })
                          }
                          testID={j === 0 && i === 0 ? 'slot-first' : `slot-${court.id}-${j}`}
                          style={styles.chip}
                        />
                      );
                    })}
                  </View>
                </View>
              );
            })}

            {selected && (
              <View style={styles.summary} testID="slot-selected">
                <Text style={styles.courtName}>
                  {t('findSlot.selected', {
                    court: selected.court.name,
                    day: formatDay(date, defaultLocale),
                    time: formatTime(selected.slot.starts_at, club.data.timezone, defaultLocale),
                    minutes: selected.durationMinutes,
                  })}
                </Text>
                <Text style={styles.body}>
                  {t('findSlot.price', {
                    amount: formatPrice(selected.slot.amount_cents, defaultLocale),
                    deposit: formatPrice(selected.slot.deposit_cents, defaultLocale),
                  })}
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, gap: 12 },
  title: {
    fontFamily: fonts.displayExtraBold,
    fontSize: 28,
    letterSpacing: 28 * -0.02,
    color: colors.text,
  },
  body: { fontFamily: fonts.body, fontSize: 15, color: colors.textSecondary },
  error: { fontFamily: fonts.body, fontSize: 15, color: color.alert },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.text,
  },
  back: { alignSelf: 'flex-start' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14 },
  court: { gap: 8, paddingTop: 8 },
  courtName: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: colors.text },
  summary: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
});
