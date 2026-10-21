// Player profile: name, photo placeholder, declared category, dominant hand, playing side and
// the training opt-out. Reads GET /me, saves PATCH /me, and deletes the account with DELETE /me
// after a confirmation step.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Schema } from '@app/contracts';
import { Button, Card, DataLabel } from '@app/ui/native';
import { theme } from '@app/ui/tokens';

import { useApi } from '../api/client';
import { fonts } from '../theme/fonts';
import {
  CATEGORIES,
  HANDS,
  SIDES,
  ProfileApiError,
  errorKey,
  formFromUser,
  validateProfile,
  type ProfileForm,
} from './profile-form';
import { AccountDeleted, DeleteAccount, useDeleteAccount } from './DeleteAccount';

const colors = theme.light;
const ME_KEY = ['me'] as const;

interface ChoiceProps<T extends string> {
  label: string;
  options: readonly T[];
  value: T | null;
  optionLabel: (option: T) => string;
  onChange: (option: T) => void;
  testID: string;
}

function Choice<T extends string>({
  label,
  options,
  value,
  optionLabel,
  onChange,
  testID,
}: ChoiceProps<T>) {
  return (
    <View style={styles.field}>
      <DataLabel label={label} />
      <View style={styles.chips} accessibilityRole="radiogroup">
        {options.map((option) => (
          <Button
            key={option}
            label={optionLabel(option)}
            variant={value === option ? 'primary' : 'secondary'}
            accessibilityRole="radio"
            accessibilityState={{ selected: value === option }}
            onPress={() => onChange(option)}
            testID={`${testID}-${option}`}
            style={styles.chip}
          />
        ))}
      </View>
    </View>
  );
}

export function ProfileScreen() {
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

  const [form, setForm] = useState<ProfileForm | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof ProfileForm, string>>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (me.data && !form) setForm(formFromUser(me.data));
  }, [me.data, form]);

  const save = useMutation({
    mutationFn: async (body: Schema<'UserUpdate'>) => {
      const { data, error } = await api.PATCH('/me', { body });
      if (!data) throw new ProfileApiError(error?.code ?? 'INTERNAL_ERROR');
      return data;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(ME_KEY, user);
      setForm(formFromUser(user));
      setSaved(true);
    },
  });

  const remove = useDeleteAccount();

  function update<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    setSaved(false);
  }

  function onSave() {
    if (!form) return;
    const result = validateProfile(form);
    if (!result.ok) {
      setFieldErrors(result.errors);
      return;
    }
    save.mutate(result.body);
  }

  if (remove.data) return <AccountDeleted deletion={remove.data} />;

  if (me.isError) {
    return (
      <SafeAreaView style={styles.screen} testID="profile-load-error">
        <View style={styles.centered}>
          <Text style={styles.body}>{t(errorKey(me.error))}</Text>
          <Button
            label={t('profile.retry')}
            onPress={() => void me.refetch()}
            testID="profile-retry"
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!form) {
    return (
      <SafeAreaView style={styles.screen} testID="profile-loading">
        <View style={styles.centered}>
          <Text style={styles.body}>{t('profile.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const initial = form.display_name.trim().charAt(0).toUpperCase();

  return (
    <SafeAreaView style={styles.screen} testID="profile-screen">
      <ScrollView contentContainerStyle={styles.content}>
        <DataLabel label={t('profile.dataLabel')} />
        <Text style={styles.title}>{t('profile.title')}</Text>

        <View style={styles.photoRow}>
          <View
            style={styles.photo}
            accessibilityLabel={t('profile.photoPlaceholder')}
            testID="profile-photo"
          >
            <Text style={styles.photoInitial}>{initial}</Text>
          </View>
          <Text style={styles.hint}>{t('profile.photoSoon')}</Text>
        </View>

        <View style={styles.field}>
          <DataLabel label={t('profile.name.label')} />
          <TextInput
            value={form.display_name}
            onChangeText={(text) => update('display_name', text)}
            placeholder={t('profile.name.placeholder')}
            accessibilityLabel={t('profile.name.label')}
            style={styles.input}
            maxLength={100}
            testID="profile-name"
          />
          {fieldErrors.display_name ? (
            <Text style={styles.error} testID="profile-name-error">
              {t(fieldErrors.display_name)}
            </Text>
          ) : null}
        </View>

        <Choice
          label={t('profile.category.label')}
          options={CATEGORIES}
          value={form.declared_category}
          optionLabel={(c) => t(`profile.category.options.${c}`)}
          onChange={(c) => update('declared_category', c)}
          testID="profile-category"
        />
        <Choice
          label={t('profile.hand.label')}
          options={HANDS}
          value={form.dominant_hand}
          optionLabel={(h) => t(`profile.hand.options.${h}`)}
          onChange={(h) => update('dominant_hand', h)}
          testID="profile-hand"
        />
        <Choice
          label={t('profile.side.label')}
          options={SIDES}
          value={form.playing_side}
          optionLabel={(s) => t(`profile.side.options.${s}`)}
          onChange={(s) => update('playing_side', s)}
          testID="profile-side"
        />

        <Card>
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.label}>{t('profile.trainingOptOut.label')}</Text>
              <Text style={styles.hint}>{t('profile.trainingOptOut.body')}</Text>
            </View>
            <Switch
              value={form.training_opt_out}
              onValueChange={(value) => update('training_opt_out', value)}
              accessibilityLabel={t('profile.trainingOptOut.label')}
              trackColor={{ true: colors.primary, false: colors.border }}
              testID="profile-training-opt-out"
            />
          </View>
        </Card>

        {save.isError ? (
          <Text style={styles.error} testID="profile-save-error">
            {t(errorKey(save.error))}
          </Text>
        ) : null}
        {saved ? (
          <Text style={styles.success} testID="profile-saved">
            {t('profile.saved')}
          </Text>
        ) : null}
        <Button
          label={save.isPending ? t('profile.saving') : t('profile.save')}
          onPress={onSave}
          disabled={save.isPending}
          testID="profile-save"
        />

        <View style={styles.danger}>
          <DeleteAccount remove={remove} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, gap: 20 },
  centered: { flex: 1, justifyContent: 'center', gap: 16, padding: 24 },
  title: {
    fontFamily: fonts.displayBlack,
    fontSize: 36,
    letterSpacing: 36 * -0.02,
    color: colors.text,
  },
  body: { fontFamily: fonts.body, fontSize: 16, color: colors.textSecondary },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: colors.text },
  hint: { fontFamily: fonts.body, fontSize: 14, color: colors.textTertiary, flexShrink: 1 },
  field: { gap: 8 },
  input: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, minHeight: 40 },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  photo: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoInitial: { fontFamily: fonts.displayBlack, fontSize: 32, color: colors.onPrimary },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchText: { flex: 1, gap: 4 },
  error: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.danger },
  success: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.primary },
  danger: { marginTop: 16 },
});
