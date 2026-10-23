// The star that marks a club as favorite. Used on the club profile, the map and the list.
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text } from 'react-native';

import { color } from '@app/ui/tokens';

import { useFavoriteActions, useFavorites } from './favorites-data';

interface FavoriteStarProps {
  clubId: string;
  clubName: string;
  size?: number;
}

export function FavoriteStar({ clubId, clubName, size = 44 }: FavoriteStarProps) {
  const { t } = useTranslation();
  const favorites = useFavorites();
  const { add, remove } = useFavoriteActions();
  const isFavorite = favorites.data?.some((f) => f.club_id === clubId) ?? false;
  const busy = add.isPending || remove.isPending;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(isFavorite ? 'favorites.unmark' : 'favorites.mark', { club: clubName })}
      accessibilityState={{ selected: isFavorite, busy }}
      disabled={busy || favorites.isPending}
      hitSlop={Math.max(0, (44 - size) / 2)}
      onPress={() => (isFavorite ? remove.mutate(clubId) : add.mutate(clubId))}
      style={[styles.star, { width: size, height: size, borderRadius: size / 2 }]}
      testID={`favorite-star-${clubId}`}
    >
      <Text style={[styles.glyph, { fontSize: size * 0.55 }, isFavorite && styles.on]}>
        {isFavorite ? '★' : '☆'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  star: { alignItems: 'center', justifyContent: 'center', backgroundColor: color.white },
  glyph: { color: color.night },
  on: { color: color.court },
});
