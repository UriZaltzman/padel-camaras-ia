// "Este soy yo" (spec §5, §16): the unclaimed players as thumbnails; the user taps theirs. No face
// recognition. Each confirmation removes an option for the others.
import { useTranslation } from 'react-i18next';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, DataLabel } from '@app/ui/native';
import { theme } from '@app/ui/tokens';

import { fonts } from '../theme/fonts';
import { unclaimedPlayers, useClaimPlayer, useSignedUrl, type MatchDetail } from './match-data';

const colors = theme.light;

function Thumb({ mediaId }: { mediaId: string | null }) {
  const signed = useSignedUrl(mediaId);
  return signed.data ? (
    <Image source={{ uri: signed.data.url }} style={styles.thumb} />
  ) : (
    <View style={styles.thumb} />
  );
}

interface Props {
  match: MatchDetail;
  signedIn: boolean;
}

export function ClaimPlayer({ match, signedIn }: Props) {
  const { t } = useTranslation();
  const claim = useClaimPlayer(match.id);
  const code = claim.error?.message ?? '';
  return (
    <Card>
      <View style={styles.body} testID="match-claim">
        <DataLabel label={t('match.claim.title')} />
        <Text style={styles.text}>{t('match.claim.hint')}</Text>
        {signedIn ? null : (
          <Text style={styles.text} testID="match-claim-guest">
            {t('match.claim.guest')}
          </Text>
        )}
        <View style={styles.row}>
          {unclaimedPlayers(match).map((p) => (
            <Pressable
              key={p.position}
              testID={`match-claim-${p.position}`}
              accessibilityRole="button"
              accessibilityLabel={t('match.claim.action')}
              disabled={!signedIn || claim.isPending}
              onPress={() => claim.mutate(p.position)}
              style={styles.option}
            >
              <Thumb mediaId={p.thumbnail_media_id} />
              <Text style={styles.text}>{t('match.claim.position', { n: p.position })}</Text>
              {p.suggested ? (
                <Text style={styles.suggested} testID={`match-claim-suggested-${p.position}`}>
                  {t('match.claim.suggested')}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
        {claim.isError ? (
          <Text style={styles.text} testID="match-claim-error">
            {t(`match.claim.error.${code}`, { defaultValue: t('match.claim.error.generic') })}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  option: { alignItems: 'center', gap: 4 },
  thumb: { width: 72, height: 96, borderRadius: 8, backgroundColor: colors.textTertiary },
  text: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary },
  suggested: { fontFamily: fonts.monoMedium, fontSize: 12, color: colors.text },
});
