// Edit the favorites (screen s08): move a club up or down to set the order of the home, or
// remove it. Removing a favorite never cancels its bookings.
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card } from '@app/ui/native';
import { color, theme } from '@app/ui/tokens';

import { fonts } from '../theme/fonts';
import {
  clubInitials,
  moveItem,
  useFavoriteActions,
  useFavorites,
  useHomeFavorites,
} from './favorites-data';

const colors = theme.light;

interface EditFavoritesProps {
  onDone: () => void;
  onFindClubs?: () => void;
}

export function EditFavorites({ onDone, onFindClubs }: EditFavoritesProps) {
  const { t } = useTranslation();
  const favorites = useFavorites();
  const home = useHomeFavorites();
  const { remove, reorder } = useFavoriteActions();
  const items = favorites.data ?? [];
  const ids = items.map((f) => f.club_id);
  const upcoming = (clubId: string) =>
    home.data?.find((f) => f.club.club_id === clubId)?.next_bookings.length ?? 0;

  return (
    <SafeAreaView style={styles.screen} testID="edit-favorites">
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t('favorites.editTitle')}</Text>
        <Text style={styles.small}>{t('favorites.editHint')}</Text>
        {items.map((f, i) => (
          <Card key={f.club_id} style={styles.card}>
            <View style={styles.row} testID={`edit-${f.club_id}`}>
              <View style={styles.arrows}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('favorites.up', { club: f.name })}
                  disabled={i === 0 || reorder.isPending}
                  onPress={() => reorder.mutate(moveItem(ids, i, -1))}
                  style={styles.arrow}
                  testID={`up-${f.club_id}`}
                >
                  <Text style={[styles.arrowText, i === 0 && styles.off]}>▲</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('favorites.down', { club: f.name })}
                  disabled={i === items.length - 1 || reorder.isPending}
                  onPress={() => reorder.mutate(moveItem(ids, i, 1))}
                  style={styles.arrow}
                  testID={`down-${f.club_id}`}
                >
                  <Text style={[styles.arrowText, i === items.length - 1 && styles.off]}>▼</Text>
                </Pressable>
              </View>
              <View style={styles.logo}>
                <Text style={styles.logoText}>{clubInitials(f.name)}</Text>
              </View>
              <View style={styles.grow}>
                <Text style={styles.name}>{f.name}</Text>
                <Text style={styles.small}>
                  {t('favorites.upcoming', { count: upcoming(f.club_id) })}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('favorites.remove', { club: f.name })}
                disabled={remove.isPending}
                onPress={() => remove.mutate(f.club_id)}
                style={styles.remove}
                testID={`remove-${f.club_id}`}
              >
                <Text style={styles.removeText}>−</Text>
              </Pressable>
            </View>
          </Card>
        ))}
        {onFindClubs ? (
          <Button
            label={t('favorites.addAnother')}
            variant="secondary"
            testID="favorites-add-another"
            onPress={onFindClubs}
          />
        ) : null}
        <Text style={styles.small}>{t('favorites.removeNote')}</Text>
      </ScrollView>
      <Button label={t('favorites.done')} testID="favorites-done" onPress={onDone} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: 24 },
  content: { gap: 12, paddingBottom: 24 },
  title: {
    fontFamily: fonts.displayBlack,
    fontSize: 26,
    letterSpacing: 26 * -0.02,
    color: colors.text,
  },
  small: { fontFamily: fonts.body, fontSize: 13, color: colors.textTertiary },
  card: { width: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grow: { flex: 1, minWidth: 0 },
  name: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.text },
  arrows: { alignItems: 'center' },
  arrow: { width: 44, height: 22, alignItems: 'center', justifyContent: 'center' },
  arrowText: { fontSize: 14, color: colors.textSecondary },
  off: { opacity: 0.3 },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { fontFamily: fonts.displayBlack, fontSize: 15, color: colors.onPrimary },
  remove: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: color.alert,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { fontSize: 22, color: color.alert },
});
