'use client';

import type { Schema } from '@app/contracts';
import { Button } from '@app/ui/web';
import { useActionState } from 'react';

import { updateProfile } from '@/app/(player)/actions';
import { t, type MessageKey } from '@/i18n';
import { initialFormState, type FormState } from '@/lib/player/forms';

import { errorClass, inputClass, labelClass } from './styles';

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

const categories = ['8', '7', '6', '5', '4', '3', '2', '1'] as const;
const hands = ['right', 'left'] as const;
const sides = ['drive', 'reves', 'both'] as const;

export function ProfileForm({
  user,
  action = updateProfile,
}: {
  user: Schema<'User'>;
  action?: Action;
}) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      <label className={labelClass}>
        {t('player.profile.name')}
        <input
          name="display_name"
          defaultValue={user.display_name}
          required
          maxLength={80}
          autoComplete="name"
          className={inputClass}
        />
      </label>
      <Select
        name="declared_category"
        label="player.profile.category"
        value={user.declared_category}
        options={categories.map((c) => [c, t('player.profile.categoryValue', { n: c })])}
      />
      <Select
        name="dominant_hand"
        label="player.profile.hand"
        value={user.dominant_hand}
        options={hands.map((h) => [h, t(`player.profile.hand.${h}`)])}
      />
      <Select
        name="playing_side"
        label="player.profile.side"
        value={user.playing_side}
        options={sides.map((s) => [s, t(`player.profile.side.${s}`)])}
      />
      <label className={labelClass}>
        {t('player.profile.birthDate')}
        <input
          name="birth_date"
          type="date"
          defaultValue={user.birth_date ?? ''}
          className={inputClass}
        />
      </label>
      <label className="flex min-h-11 items-center gap-2">
        <input type="checkbox" name="training_opt_out" defaultChecked={user.training_opt_out} />
        {t('player.profile.trainingOptOut')}
      </label>
      {state.status === 'error' && (
        <p role="alert" className={errorClass}>
          {t(state.error)}
        </p>
      )}
      {state.status === 'saved' && <p role="status">{t('player.profile.saved')}</p>}
      <Button type="submit" disabled={pending} label={t('player.profile.save')} />
    </form>
  );
}

function Select({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: MessageKey;
  value: string | null;
  options: [string, string][];
}) {
  return (
    <label className={labelClass}>
      {t(label)}
      <select name={name} defaultValue={value ?? ''} className={inputClass}>
        <option value="">{t('player.profile.unset')}</option>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
