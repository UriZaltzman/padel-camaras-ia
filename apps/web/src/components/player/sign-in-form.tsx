'use client';

import { brand } from '@app/config/brand';
import { Button } from '@app/ui/web';
import { useActionState } from 'react';

import { requestCode, verifyCode } from '@/app/(player)/actions';
import { t } from '@/i18n';
import { initialSignInState, type SignInState } from '@/lib/player/forms';

import { errorClass, inputClass, labelClass } from './styles';

type Action = (state: SignInState, formData: FormData) => Promise<SignInState>;

const legalUrl = (path: string) => `https://${brand.domain}/${path}`;

export function SignInForm({
  next,
  request = requestCode,
  verify = verifyCode,
}: {
  next: string;
  request?: Action;
  verify?: Action;
}) {
  // One state for both steps: the code step starts from the phone step's result.
  const [state, dispatch, pending] = useActionState<SignInState, FormData>(
    async (prev, formData) =>
      formData.get('intent') === 'request' ? request(prev, formData) : verify(prev, formData),
    initialSignInState,
  );
  const error = state.error ? (
    <p id="sign-in-error" role="alert" className={errorClass}>
      {t(state.error)}
    </p>
  ) : null;

  if (state.step === 'phone') {
    return (
      <form action={dispatch} noValidate className="flex flex-col gap-4">
        <input type="hidden" name="intent" value="request" />
        <label className={labelClass}>
          {t('player.signIn.phone')}
          <input
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? 'sign-in-error' : 'phone-hint'}
            className={inputClass}
          />
        </label>
        <p id="phone-hint" className="text-sm">
          {t('player.signIn.phoneHint')}
        </p>
        {error}
        <Button type="submit" disabled={pending} label={t('player.signIn.sendCode')} />
      </form>
    );
  }

  return (
    <form action={dispatch} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="intent" value="verify" />
      <input type="hidden" name="next" value={next} />
      <p role="status">{t('player.signIn.codeSent', { phone: state.phone })}</p>
      <label className={labelClass}>
        {t('player.signIn.code')}
        <input
          name="code"
          defaultValue={state.code}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? 'sign-in-error' : undefined}
          className={inputClass}
        />
      </label>
      {state.needsConsent && (
        <div className="flex flex-col gap-2 rounded-xl border border-line p-3">
          <p>{t('player.signIn.newAccount')}</p>
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" name="consent" required />
            <span>
              {t('player.signIn.consent')}{' '}
              <a className="underline" href={legalUrl('terminos')} target="_blank" rel="noreferrer">
                {t('player.signIn.terms')}
              </a>{' '}
              {t('player.signIn.and')}{' '}
              <a
                className="underline"
                href={legalUrl('privacidad')}
                target="_blank"
                rel="noreferrer"
              >
                {t('player.signIn.privacy')}
              </a>
            </span>
          </label>
        </div>
      )}
      {error}
      <Button type="submit" disabled={pending} label={t('player.signIn.enter')} />
    </form>
  );
}
