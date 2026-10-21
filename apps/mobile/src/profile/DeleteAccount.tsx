// Account deletion (Ley 25.326): confirmation step, DELETE /me, and the screen that follows.
// Shared by the profile and the settings screens.
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Schema } from '@app/contracts';
import { Button, Card } from '@app/ui/native';
import { theme } from '@app/ui/tokens';

import { useApi } from '../api/client';
import { useSession } from '../auth/session';
import { defaultLocale } from '../i18n';
import {
  cancelAllBookingReminders,
  deviceNotifications,
  type NotificationsModule,
} from '../notifications/reminders';
import { fonts } from '../theme/fonts';
import { ProfileApiError, errorKey, formatDeletionDate } from './profile-form';

const colors = theme.light;

export function useDeleteAccount(notifications: NotificationsModule = deviceNotifications) {
  const api = useApi();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await api.DELETE('/me');
      if (!data) throw new ProfileApiError(error?.code ?? 'INTERNAL_ERROR');
      // No more reminders for an account that is going away.
      await cancelAllBookingReminders(notifications).catch(() => undefined);
      return data;
    },
  });
}

type DeleteMutation = ReturnType<typeof useDeleteAccount>;

export function DeleteAccount({ remove }: { remove: DeleteMutation }) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button
        label={t('profile.delete.entry')}
        variant="secondary"
        onPress={() => setConfirming(true)}
        testID="profile-delete"
      />
    );
  }
  return (
    <View testID="profile-delete-confirm">
      <Card>
        <Text style={styles.label}>{t('profile.delete.confirmTitle')}</Text>
        <Text style={styles.body}>{t('profile.delete.confirmBody')}</Text>
        {remove.isError ? (
          <Text style={styles.error} testID="profile-delete-error">
            {t(errorKey(remove.error))}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Button
            label={t('profile.delete.confirm')}
            onPress={() => remove.mutate()}
            disabled={remove.isPending}
            testID="profile-delete-confirm-button"
          />
          <Button
            label={t('profile.delete.cancel')}
            variant="secondary"
            onPress={() => setConfirming(false)}
            testID="profile-delete-cancel"
          />
        </View>
      </Card>
    </View>
  );
}

export function AccountDeleted({ deletion }: { deletion: Schema<'AccountDeletion'> }) {
  const { t } = useTranslation();
  const { signOut } = useSession();
  return (
    <SafeAreaView style={styles.screen} testID="profile-deleted">
      <View style={styles.centered}>
        <Text style={styles.title}>{t('profile.delete.doneTitle')}</Text>
        <Text style={styles.body}>
          {t('profile.delete.doneBody', {
            date: formatDeletionDate(deletion.deletion_scheduled_for, defaultLocale),
          })}
        </Text>
        <Button
          label={t('profile.delete.exit')}
          onPress={() => void signOut()}
          testID="profile-deleted-exit"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', gap: 16, padding: 24 },
  title: {
    fontFamily: fonts.displayBlack,
    fontSize: 36,
    letterSpacing: 36 * -0.02,
    color: colors.text,
  },
  body: { fontFamily: fonts.body, fontSize: 16, color: colors.textSecondary },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: colors.text },
  error: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.danger },
  actions: { gap: 8, marginTop: 12 },
});
