// How the clubs found are shown. Today a list; the map with logo pins (#259) implements the same
// ClubResultsProps and is swapped in by FindSlotScreen without touching the rest of the flow.
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Schema } from '@app/contracts';
import { theme } from '@app/ui/tokens';

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
        <Pressable
          key={club.id}
          accessibilityRole="button"
          onPress={() => onSelect(club)}
          style={({ pressed }) => [styles.item, pressed && styles.pressed]}
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
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  item: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  pressed: { opacity: 0.7 },
  name: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: colors.text },
  meta: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary },
});
