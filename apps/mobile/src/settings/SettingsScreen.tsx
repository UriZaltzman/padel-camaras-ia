// Settings: booking reminders (local notifications, 1 h before) and privacy (training opt-out
// and account deletion). The opt-out saves right away with PATCH /me.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, DataLabel } from '@app/ui/native';
import { theme } from '@app/ui/tokens';

import { useApi } from '../api/client';
import { securePreferenceStore, type PreferenceStore } from '../notifications/preferences';
import {
  cancelAllBookingReminders,
  deviceNotifications,
  ensurePermission,
  type NotificationsModule,
} from '../notifications/reminders';
import { AccountDeleted, DeleteAccount, useDeleteAccount } from '../profile/DeleteAccount';
import { ProfileApiError, errorKey } from '../profile/profile-form';
import { fonts } from '../theme/fonts';

const colors = theme.light;
const ME_KEY = ['me'] as const;

interface SettingsScreenProps {
  notifications?: NotificationsModule;
  preferences?: PreferenceStore;
}

interface ToggleRowProps {
  label: string;
  body: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
  testID: string;
}

function ToggleRow({ label, body, value, disabled, onChange, testID }: ToggleRowProps) {
  return (
    <View style={styles.switchRow}>
      <View style={styles.switchText}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.hint}>{body}</Text>
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ true: colors.primary, false: colors.border }}
        testID={testID}
      />
    </View>
  );
}

export function SettingsScreen({
  notifications = deviceNotifications,
  preferences = securePreferenceStore,
}: SettingsScreenProps) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();

  const me = useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      const { data, error } = await api.GET('/me');
      if (!data) throw new ProfileApiError(error?.code ?? 'INTERNAL_ERROR');
      return data;
    },
  });

  const [reminders, setReminders] = useState<boolean | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    let active = true;
    void preferences.remindersEnabled().then((enabled) => {
      if (active) setReminders(enabled);
    });
    return () => {
      active = false;
    };
  }, [preferences]);

  async function onRemindersChange(enabled: boolean) {
    setPermissionDenied(false);
    if (enabled && !(await ensurePermission(notifications))) {
      setPermissionDenied(true);
      return;
    }
    if (!enabled) await cancelAllBookingReminders(notifications);
    await preferences.setRemindersEnabled(enabled);
    setReminders(enabled);
  }

  const optOut = useMutation({
    mutationFn: async (training_opt_out: boolean) => {
      const { data, error } = await api.PATCH('/me', { body: { training_opt_out } });
      if (!data) throw new ProfileApiError(error?.code ?? 'INTERNAL_ERROR');
      return data;
    },
    onSuccess: (user) => queryClient.setQueryData(ME_KEY, user),
  });

  const remove = useDeleteAccount(notifications);

  if (remove.data) return <AccountDeleted deletion={remove.data} />;

  const trainingOptOut = optOut.isPending ? optOut.variables : (me.data?.training_opt_out ?? false);

  return (
    <SafeAreaView style={styles.screen} testID="settings-screen">
      <ScrollView contentContainerStyle={styles.content}>
        <DataLabel label={t('settings.dataLabel')} />
        <Text style={styles.title}>{t('settings.title')}</Text>

        <Text style={styles.section}>{t('settings.notifications.title')}</Text>
        <Card>
          <ToggleRow
            label={t('settings.notifications.reminders.label')}
            body={t('settings.notifications.reminders.body')}
            value={reminders ?? false}
            disabled={reminders === null}
            onChange={(value) => void onRemindersChange(value)}
            testID="settings-reminders"
          />
          {permissionDenied ? (
            <Text style={styles.error} testID="settings-permission-denied">
              {t('settings.notifications.permissionDenied')}
            </Text>
          ) : null}
        </Card>

        <Text style={styles.section}>{t('settings.privacy.title')}</Text>
        {me.isError ? (
          <View style={styles.inline} testID="settings-load-error">
            <Text style={styles.error}>{t(errorKey(me.error))}</Text>
            <Button
              label={t('profile.retry')}
              variant="secondary"
              onPress={() => void me.refetch()}
              testID="settings-retry"
            />
          </View>
        ) : (
          <Card>
            <ToggleRow
              label={t('profile.trainingOptOut.label')}
              body={t('profile.trainingOptOut.body')}
              value={trainingOptOut}
              disabled={!me.data || optOut.isPending}
              onChange={(value) => optOut.mutate(value)}
              testID="settings-training-opt-out"
            />
            {optOut.isError ? (
              <Text style={styles.error} testID="settings-opt-out-error">
                {t(errorKey(optOut.error))}
              </Text>
            ) : null}
            {optOut.isSuccess ? (
              <Text style={styles.success} testID="settings-opt-out-saved">
                {t(
                  optOut.data.training_opt_out
                    ? 'settings.privacy.optOutOn'
                    : 'settings.privacy.optOutOff',
                )}
              </Text>
            ) : null}
          </Card>
        )}

        <View style={styles.danger}>
          <DeleteAccount remove={remove} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, gap: 16 },
  inline: { gap: 8 },
  title: {
    fontFamily: fonts.displayBlack,
    fontSize: 36,
    letterSpacing: 36 * -0.02,
    color: colors.text,
  },
  section: { fontFamily: fonts.bodySemiBold, fontSize: 18, color: colors.text, marginTop: 8 },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: colors.text },
  hint: { fontFamily: fonts.body, fontSize: 14, color: colors.textTertiary, flexShrink: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchText: { flex: 1, gap: 4 },
  error: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.danger, marginTop: 8 },
  success: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.primary, marginTop: 8 },
  danger: { marginTop: 16 },
});
