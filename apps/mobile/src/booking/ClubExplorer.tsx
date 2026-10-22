// Club discovery (issue #259): filter by locality, day and hour, and see the clubs on the map or
// in a list. With an hour picked, only clubs that have a free start in that hour are shown, found
// with GET /clubs/{id} and GET /courts/{id}/availability. Days stay inside the player horizon.
import { useQueries } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Schema } from '@app/contracts';
import { Button, DataLabel } from '@app/ui/native';
import { color, theme } from '@app/ui/tokens';

import { useApi } from '../api/client';
import { defaultLocale } from '../i18n';
import { fonts } from '../theme/fonts';
import { ClubList, type ClubResultsProps } from './ClubResults';
import { ClubMap } from './ClubMap';
import {
  BookingApiError,
  bookableCourts,
  errorKey,
  formatDay,
  type BookingDuration,
} from './find-slot';
import { SEARCH_HOURS, hasSlotInHour, hourLabel } from './hours';
import { localityKey } from './localities';
import { mapProvider } from './map-config';

const colors = theme.light;
const SEARCH_DURATION: BookingDuration = 90;

export interface ClubExplorerProps extends ClubResultsProps {
  /** Days the player may pick (already inside the booking horizon); the first is today. */
  dates: string[];
}

export function ClubExplorer({ clubs, onSelect, dates }: ClubExplorerProps) {
  const { t } = useTranslation();
  const api = useApi();
  mapProvider();
  const [mode, setMode] = useState<'map' | 'list'>('map');
  const [locality, setLocality] = useState<string | null>(null);
  const [date, setDate] = useState(dates[0] ?? '');
  const [hour, setHour] = useState<number | null>(null);

  const localities = [
    ...new Map(clubs.map((c) => [localityKey(c.city), c.city] as const)).entries(),
  ];
  const inZone = clubs.filter((c) => locality === null || localityKey(c.city) === locality);

  const free = useQueries({
    queries: inZone.map((club) => ({
      queryKey: ['club-free', club.id, date, hour, SEARCH_DURATION],
      enabled: hour !== null,
      retry: (failures: number, error: unknown) =>
        !(error instanceof BookingApiError) && failures < 2,
      queryFn: async () => {
        const detail = await api.GET('/clubs/{id}', { params: { path: { id: club.id } } });
        if (!detail.data) throw new BookingApiError(detail.error?.code ?? 'INTERNAL_ERROR');
        const tz = detail.data.timezone;
        for (const court of bookableCourts(detail.data as Schema<'Club'>)) {
          const res = await api.GET('/courts/{id}/availability', {
            params: { path: { id: court.id }, query: { date, duration_minutes: SEARCH_DURATION } },
          });
          if (!res.data) throw new BookingApiError(res.error?.code ?? 'INTERNAL_ERROR');
          if (hour !== null && hasSlotInHour(res.data.slots, hour, tz)) return true;
        }
        return false;
      },
    })),
  });

  const searching = hour !== null;
  const pending = searching && free.some((q) => q.isPending);
  const failed = searching ? free.find((q) => q.isError) : undefined;
  const shown = searching ? inZone.filter((_, i) => free[i]?.data === true) : inZone;
  const View_ = mode === 'map' ? ClubMap : ClubList;

  return (
    <View style={styles.wrap} testID="club-explorer">
      <DataLabel label={t('findSlot.filters.locality')} />
      <ScrollView horizontal contentContainerStyle={styles.chips} testID="locality-filter">
        <Button
          label={t('findSlot.filters.allLocalities')}
          variant={locality === null ? 'primary' : 'secondary'}
          onPress={() => setLocality(null)}
          testID="locality-all"
          style={styles.chip}
        />
        {localities.map(([key, name]) => (
          <Button
            key={key}
            label={name}
            variant={locality === key ? 'primary' : 'secondary'}
            onPress={() => setLocality(key)}
            testID={`locality-${key}`}
            style={styles.chip}
          />
        ))}
      </ScrollView>

      <DataLabel label={t('findSlot.filters.day')} />
      <ScrollView horizontal contentContainerStyle={styles.chips}>
        {dates.map((d) => (
          <Button
            key={d}
            label={formatDay(d, defaultLocale)}
            variant={date === d ? 'primary' : 'secondary'}
            onPress={() => setDate(d)}
            testID={`filter-date-${d}`}
            style={styles.chip}
          />
        ))}
      </ScrollView>

      <DataLabel label={t('findSlot.filters.hour')} />
      <ScrollView horizontal contentContainerStyle={styles.chips}>
        <Button
          label={t('findSlot.filters.anyHour')}
          variant={hour === null ? 'primary' : 'secondary'}
          onPress={() => setHour(null)}
          testID="hour-any"
          style={styles.chip}
        />
        {SEARCH_HOURS.map((h) => (
          <Button
            key={h}
            label={hourLabel(h)}
            variant={hour === h ? 'primary' : 'secondary'}
            onPress={() => setHour(h)}
            testID={`hour-${h}`}
            style={styles.chip}
          />
        ))}
      </ScrollView>

      <View style={styles.chips} accessibilityRole="radiogroup">
        {(['map', 'list'] as const).map((m) => (
          <Button
            key={m}
            label={t(`findSlot.view.${m}`)}
            variant={mode === m ? 'primary' : 'secondary'}
            accessibilityRole="radio"
            accessibilityState={{ selected: mode === m }}
            onPress={() => setMode(m)}
            testID={`view-${m}`}
            style={styles.chip}
          />
        ))}
      </View>

      {pending && <ActivityIndicator color={colors.primary} />}
      {failed && (
        <Text style={styles.error} testID="find-slot-error">
          {t(errorKey(failed.error))}
        </Text>
      )}
      {!pending && !failed && shown.length === 0 && (
        <Text style={styles.body} testID="club-empty-zone">
          {t('findSlot.emptyZone')}
        </Text>
      )}
      {!pending && !failed && shown.length > 0 && <View_ clubs={shown} onSelect={onSelect} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14 },
  body: { fontFamily: fonts.body, fontSize: 15, color: colors.textSecondary },
  error: { fontFamily: fonts.body, fontSize: 15, color: color.alert },
});
