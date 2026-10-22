// Map view of the clubs found (issue #259): one pin per club with its logo, nearby pins merged
// into a counted cluster that zooms in when pressed. Same props as ClubList, so it is swappable.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import type { Schema } from '@app/contracts';
import { Button } from '@app/ui/native';
import { theme } from '@app/ui/tokens';

import { fonts } from '../theme/fonts';
import type { ClubResultsProps } from './ClubResults';
import { clubPosition } from './localities';
import { DEFAULT_VIEWPORT, clusterPins, fitViewport, type Pin, type Viewport } from './map-cluster';

const colors = theme.light;
const PIN = 40;

function ClubPin({ club }: { club: Schema<'ClubSummary'> }) {
  return club.logo_url ? (
    <Image source={{ uri: club.logo_url }} style={styles.logo} accessibilityLabel={club.name} />
  ) : (
    <Text style={styles.initial}>{club.name.charAt(0).toUpperCase()}</Text>
  );
}

export function ClubMap({ clubs, onSelect }: ClubResultsProps) {
  const { t } = useTranslation();
  const [size, setSize] = useState({ width: 320, height: 360 });
  const [view, setView] = useState<Viewport>(DEFAULT_VIEWPORT);

  const pins: Pin<Schema<'ClubSummary'>>[] = [];
  for (const club of clubs) {
    const pos = clubPosition(club);
    if (pos) pins.push({ item: club, pos });
  }
  const clusters = clusterPins(pins, view, size.width, size.height);
  const unplaced = clubs.length - pins.length;

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setSize({ width, height: Math.min(height, 420) });
  }

  return (
    <View style={styles.wrap} testID="club-map">
      <View style={[styles.map, { height: size.height }]} onLayout={onLayout}>
        {clusters.map((c) => {
          const style = { left: c.point.x - PIN / 2, top: c.point.y - PIN / 2 };
          const [first] = c.members;
          if (c.members.length === 1 && first) {
            return (
              <Pressable
                key={c.key}
                accessibilityRole="button"
                accessibilityLabel={first.item.name}
                onPress={() => onSelect(first.item)}
                style={[styles.pin, style]}
                testID={`pin-${first.item.id}`}
              >
                <ClubPin club={first.item} />
              </Pressable>
            );
          }
          return (
            <Pressable
              key={c.key}
              accessibilityRole="button"
              accessibilityLabel={t('findSlot.map.cluster', { count: c.members.length })}
              onPress={() =>
                setView(
                  fitViewport(
                    c.members.map((m) => m.pos),
                    view,
                  ),
                )
              }
              style={[styles.pin, styles.cluster, style]}
              testID={`cluster-${c.key}`}
            >
              <Text style={styles.count}>{c.members.length}</Text>
            </Pressable>
          );
        })}
      </View>
      {view !== DEFAULT_VIEWPORT && (
        <Button
          label={t('findSlot.map.reset')}
          variant="secondary"
          onPress={() => setView(DEFAULT_VIEWPORT)}
          testID="map-reset"
          style={styles.reset}
        />
      )}
      {unplaced > 0 && (
        <Text style={styles.note} testID="map-unplaced">
          {t('findSlot.map.unplaced', { count: unplaced })}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  map: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  pin: {
    position: 'absolute',
    width: PIN,
    height: PIN,
    borderRadius: PIN / 2,
    backgroundColor: colors.background,
    borderColor: colors.primary,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cluster: { backgroundColor: colors.primary },
  logo: { width: PIN - 4, height: PIN - 4, borderRadius: (PIN - 4) / 2 },
  initial: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: colors.text },
  count: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.background },
  reset: { alignSelf: 'flex-start' },
  note: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
});
