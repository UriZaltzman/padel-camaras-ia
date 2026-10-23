// How the clubs found are shown: this list, or the map with logo pins (ClubMap, #259). Both take
// ClubResultsProps, so FindSlotScreen swaps them without touching the rest of the flow.
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Schema } from '@app/contracts';
import { theme } from '@app/ui/tokens';

import { FavoriteStar } from '../favorites/FavoriteStar';
import { fonts } from '../theme/fonts';

const colors = theme.light;

export interface ClubResultsProps {
  clubs: Schema<'ClubSummary'>[];
  onSelect: (club: Schema<'ClubSummary'>) => void;
}

export type ClubResultsView = (props: ClubResultsProps) => React.ReactElement;

export function ClubList({ clubs, onSelect }: ClubResultsProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.list} testID="club-list">
      {clubs.map((club) => (
        <View key={club.id} style={styles.item}>
          <Pressable
            accessibilityRole="button"
            onPress={() => onSelect(club)}
            style={({ pressed }) => [styles.info, pressed && styles.pressed]}
            testID={`club-${club.id}`}
          >
            <Text style={styles.name}>{club.name}</Text>
            <Text style={styles.meta}>
              {t('findSlot.clubMeta', {
                address: club.address,
                city: club.city,
                count: club.courts_count,
              })}
            </Text>
          </Pressable>
          <FavoriteStar clubId={club.id} clubName={club.name} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  item: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingLeft: 16,
    paddingRight: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  info: { flex: 1, paddingVertical: 16, gap: 4 },
  pressed: { opacity: 0.7 },
  name: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: colors.text },
  meta: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary },
});
