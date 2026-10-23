// "Mis clubes favoritos" on the home (screens JG-01, s06/s07/s09 of the player canvas): under each
// favorite, the player's next bookings there (share, cancel, book again) and the free starts
// today. Empty state invites to star clubs; a booking just made shows at once, with the
// question "¿Marcar como favorito?" when its club is not a favorite yet.
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { Button, Card, DataLabel } from '@app/ui/native';
import { color, theme } from '@app/ui/tokens';

import { defaultLocale } from '../i18n';
import { fonts } from '../theme/fonts';
import { formatSlot } from '../home/home-data';
import { FavoriteStar } from './FavoriteStar';
import {
  clubInitials,
  useFavoriteActions,
  useHomeFavorites,
  useJustBooked,
  type HomeBooking,
  type HomeFavorite,
  type JustBooked,
} from './favorites-data';

const colors = theme.light;
const TIME_ZONE = 'America/Argentina/Buenos_Aires';

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat(defaultLocale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TIME_ZONE,
  }).format(new Date(iso));
}

function Logo({ name }: { name: string }) {
  return (
    <View style={styles.logo}>
      <Text style={styles.logoText}>{clubInitials(name)}</Text>
    </View>
  );
}

interface BookingRowProps {
  booking: HomeBooking;
  clubName: string;
  isNew?: boolean;
  onBookAgain?: () => void;
}

function BookingRow({ booking, clubName, isNew, onBookAgain }: BookingRowProps) {
  const { t } = useTranslation();
  const { cancel } = useFavoriteActions();
  const when = formatSlot(booking.starts_at);
  const status = isNew
    ? t('favorites.booking.new')
    : t(booking.status === 'confirmed' ? 'favorites.booking.paid' : 'favorites.booking.pending');

  return (
    <View style={styles.booking} testID={`favorite-booking-${booking.id}`}>
      <View style={styles.row}>
        <Text style={[styles.grow, styles.bookingTitle]}>
          {t('favorites.booking.title', { when, court: booking.court_name })}
        </Text>
        <Text style={styles.tag}>{status}</Text>
      </View>
      <View style={styles.row}>
        <Button
          label={t('favorites.booking.share')}
          variant="secondary"
          style={styles.action}
          testID={`share-${booking.id}`}
          onPress={() =>
            void Share.share({
              message: t('favorites.booking.shareMessage', { club: clubName, when }),
            })
          }
        />
        <Button
          label={t('favorites.booking.cancel')}
          variant="secondary"
          style={styles.action}
          disabled={cancel.isPending}
          testID={`cancel-${booking.id}`}
          onPress={() => cancel.mutate(booking.id)}
        />
        {onBookAgain ? (
          <Button
            label={t('favorites.booking.again')}
            style={styles.action}
            testID={`again-${booking.id}`}
            onPress={onBookAgain}
          />
        ) : null}
      </View>
      {cancel.isError ? <Text style={styles.error}>{t('home.error')}</Text> : null}
    </View>
  );
}

interface FavoriteCardProps {
  favorite: HomeFavorite;
  justBooked: JustBooked | null;
  onBookAgain?: (clubId: string) => void;
}

function FavoriteCard({ favorite, justBooked, onBookAgain }: FavoriteCardProps) {
  const { t } = useTranslation();
  const { club } = favorite;
  return (
    <Card style={styles.card}>
      <View testID={`favorite-${club.club_id}`} style={styles.cardBody}>
        <View style={styles.row}>
          <Logo name={club.name} />
          <View style={styles.grow}>
            <Text style={styles.clubName}>{club.name}</Text>
            {club.address ? <Text style={styles.small}>{club.address}</Text> : null}
          </View>
          <FavoriteStar clubId={club.club_id} clubName={club.name} />
        </View>
        {favorite.next_bookings.map((b) => (
          <BookingRow
            key={b.id}
            booking={b}
            clubName={club.name}
            isNew={justBooked?.booking_id === b.id}
            onBookAgain={onBookAgain ? () => onBookAgain(club.club_id) : undefined}
          />
        ))}
        {favorite.next_bookings.length === 0 ? (
          <Text style={styles.small} testID={`favorite-no-bookings-${club.club_id}`}>
            {t('favorites.noBookings')}
          </Text>
        ) : null}
        {favorite.free_slots_today.length > 0 ? (
          <>
            <DataLabel label={t('favorites.freeToday')} />
            <View style={styles.chips} testID={`free-${club.club_id}`}>
              {favorite.free_slots_today.map((s) => (
                <Pressable
                  key={s.starts_at}
                  accessibilityRole="button"
                  onPress={() => onBookAgain?.(club.club_id)}
                  style={styles.chip}
                >
                  <Text style={styles.chipText}>{formatTime(s.starts_at)}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
      </View>
    </Card>
  );
}

/** The question after booking in a club that is not a favorite yet (screen s09). */
function BookedBanner({ justBooked }: { justBooked: JustBooked }) {
  const { t } = useTranslation();
  return (
    <View testID="booked-banner" style={styles.cardBody}>
      <View style={styles.confirmed} accessibilityRole="alert">
        <Text style={styles.confirmedTitle}>{t('favorites.booked.title')}</Text>
        <Text style={styles.confirmedBody}>
          {t('favorites.booked.detail', {
            club: justBooked.club.name,
            when: formatSlot(justBooked.starts_at),
          })}
        </Text>
      </View>
    </View>
  );
}

function FavoritePrompt({ justBooked }: { justBooked: JustBooked }) {
  const { t } = useTranslation();
  const { add } = useFavoriteActions();
  const { dismiss } = useJustBooked();
  return (
    <Card style={styles.prompt}>
      <View testID="favorite-prompt" style={styles.cardBody}>
        <Text style={styles.clubName}>
          {t('favorites.prompt.title', { club: justBooked.club.name })}
        </Text>
        <Text style={styles.small}>{t('favorites.prompt.body')}</Text>
        <View style={styles.row}>
          <Button
            label={t('favorites.prompt.yes')}
            style={styles.grow}
            testID="favorite-prompt-yes"
            onPress={() => add.mutate(justBooked.club.id, { onSuccess: dismiss })}
          />
          <Button
            label={t('favorites.prompt.no')}
            variant="secondary"
            style={styles.grow}
            testID="favorite-prompt-no"
            onPress={dismiss}
          />
        </View>
      </View>
    </Card>
  );
}

interface FavoritesSectionProps {
  onEdit: () => void;
  onFindClubs?: () => void;
  onBookAgain?: (clubId: string) => void;
}

export function FavoritesSection({ onEdit, onFindClubs, onBookAgain }: FavoritesSectionProps) {
  const { t } = useTranslation();
  const home = useHomeFavorites();
  const { justBooked, dismiss } = useJustBooked();
  const favorites = home.data ?? [];
  // The confirmation is for this visit only: leaving the home clears it.
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  useEffect(
    () => () => {
      dismissRef.current();
    },
    [],
  );
  const isFavorite = (id: string) => favorites.some((f) => f.club.club_id === id);
  const askFavorite = justBooked !== null && !isFavorite(justBooked.club.id);

  return (
    <View style={styles.section} testID="favorites-section">
      {justBooked ? <BookedBanner justBooked={justBooked} /> : null}
      <View style={styles.row}>
        <Text style={[styles.grow, styles.heading]}>{t('favorites.title')}</Text>
        {favorites.length > 0 ? (
          <Button
            label={t('favorites.edit')}
            variant="secondary"
            testID="favorites-edit"
            onPress={onEdit}
          />
        ) : null}
      </View>

      {home.isPending ? <ActivityIndicator color={colors.primary} /> : null}
      {home.isError ? <Text style={styles.small}>{t('home.error')}</Text> : null}

      {askFavorite && justBooked ? (
        <>
          <Card style={styles.card}>
            <View testID="just-booked" style={styles.cardBody}>
              <View style={styles.row}>
                <Logo name={justBooked.club.name} />
                <View style={styles.grow}>
                  <Text style={styles.clubName}>{justBooked.club.name}</Text>
                  {justBooked.club.address ? (
                    <Text style={styles.small}>{justBooked.club.address}</Text>
                  ) : null}
                </View>
              </View>
              <BookingRow
                booking={{
                  id: justBooked.booking_id,
                  court_id: '',
                  court_name: justBooked.court_name,
                  starts_at: justBooked.starts_at,
                  ends_at: justBooked.ends_at,
                  status: justBooked.status,
                }}
                clubName={justBooked.club.name}
                isNew
                onBookAgain={onBookAgain ? () => onBookAgain(justBooked.club.id) : undefined}
              />
            </View>
          </Card>
          <FavoritePrompt justBooked={justBooked} />
        </>
      ) : null}

      {home.data && favorites.length === 0 && !askFavorite ? (
        <Card style={styles.empty}>
          <View testID="favorites-empty" style={styles.emptyBody}>
            <Text style={styles.emptyStar}>☆</Text>
            <Text style={styles.clubName}>{t('favorites.empty.title')}</Text>
            <Text style={styles.small}>{t('favorites.empty.body')}</Text>
            {onFindClubs ? (
              <Button
                label={t('favorites.empty.action')}
                testID="favorites-find"
                onPress={onFindClubs}
              />
            ) : null}
          </View>
        </Card>
      ) : null}

      {favorites.map((f) => (
        <FavoriteCard
          key={f.club.club_id}
          favorite={f}
          justBooked={justBooked}
          onBookAgain={onBookAgain}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grow: { flex: 1, minWidth: 0 },
  heading: {
    fontFamily: fonts.displayExtraBold,
    fontSize: 18,
    letterSpacing: 18 * -0.02,
    color: colors.text,
  },
  card: { width: '100%' },
  cardBody: { gap: 8 },
  clubName: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: colors.text },
  small: { fontFamily: fonts.body, fontSize: 13, color: colors.textTertiary },
  error: { fontFamily: fonts.body, fontSize: 13, color: color.alert },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { fontFamily: fonts.displayBlack, fontSize: 15, color: colors.onPrimary },
  booking: { backgroundColor: colors.background, borderRadius: 12, padding: 10, gap: 8 },
  bookingTitle: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.text },
  tag: { fontFamily: fonts.monoMedium, fontSize: 10.5, color: colors.textTertiary },
  action: { flex: 1, paddingHorizontal: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
  prompt: { width: '100%', borderColor: colors.primary },
  confirmed: { backgroundColor: color.night, borderRadius: 14, padding: 12, gap: 2 },
  confirmedTitle: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: color.white },
  confirmedBody: { fontFamily: fonts.body, fontSize: 13, color: color.line },
  empty: { width: '100%', borderStyle: 'dashed' },
  emptyBody: { alignItems: 'center', gap: 12, paddingVertical: 12 },
  emptyStar: { fontSize: 44, color: colors.primary },
});
