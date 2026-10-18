'use client';

import { useActionState } from 'react';

import { t, type MessageKey } from '@/i18n';
import type { ContactField } from '@/lib/contact/schema';
import { initialContactState, type ContactFormState } from '@/lib/contact/submit';

type Action = (state: ContactFormState, formData: FormData) => Promise<ContactFormState>;

// TODO(web-paneles): move these field and button styles to packages/ui once the shared
// components land there.
const inputClass =
  'w-full rounded-xl border border-line bg-white px-4 py-3 text-night focus:border-court focus:outline-2 focus:outline-court aria-invalid:border-alert';

// Orange on white does not reach AA for text, so errors are night text with an alert marker.
const errorClass = 'border-l-4 border-alert pl-2 text-sm font-semibold text-night';

const fieldDefs: {
  name: ContactField;
  label: MessageKey;
  autoComplete: string;
  multiline?: boolean;
}[] = [
  { name: 'name', label: 'contact.field.name', autoComplete: 'name' },
  { name: 'club', label: 'contact.field.club', autoComplete: 'organization' },
  { name: 'contact', label: 'contact.field.contact', autoComplete: 'email' },
  { name: 'message', label: 'contact.field.message', autoComplete: 'off', multiline: true },
];

export function ContactForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, initialContactState);

  if (state.status === 'success') {
    return (
      <p role="status" className="rounded-xl bg-court px-6 py-4 font-semibold text-white">
        {t('contact.success')}
      </p>
    );
  }

  const errors = state.status === 'error' ? state.fieldErrors : {};

  return (
    <form action={formAction} noValidate className="flex flex-col gap-5">
      {fieldDefs.map((field) => {
        const error = errors[field.name];
        const id = `contact-${field.name}`;
        const common = {
          id,
          name: field.name,
          autoComplete: field.autoComplete,
          'aria-invalid': error ? true : undefined,
          'aria-describedby': error ? `${id}-error` : undefined,
          className: inputClass,
        };
        return (
          <div key={field.name} className="flex flex-col gap-2">
            <label htmlFor={id} className="font-semibold">
              {t(field.label)}
            </label>
            {field.multiline ? (
              <textarea rows={4} {...common} />
            ) : (
              <input type="text" required {...common} />
            )}
            {error && (
              <p id={`${id}-error`} className={errorClass}>
                {t(error)}
              </p>
            )}
          </div>
        );
      })}
      {state.status === 'error' && state.formError && (
        <p role="alert" className={errorClass}>
          {t(state.formError)}
        </p>
      )}
      <p className="text-sm text-night">{t('contact.privacy')}</p>
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-court px-6 py-3 font-semibold text-white hover:bg-courtDark disabled:opacity-70"
      >
        {pending ? t('contact.sending') : t('contact.submit')}
      </button>
    </form>
  );
}
