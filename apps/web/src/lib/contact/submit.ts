import type { MessageKey } from '@/i18n';

import { contactSchema, type ContactField } from './schema';
import type { ContactStore } from './store';

export type ContactFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | {
      status: 'error';
      fieldErrors: Partial<Record<ContactField, MessageKey>>;
      formError?: MessageKey;
    };

export const initialContactState: ContactFormState = { status: 'idle' };

const fields: ContactField[] = ['name', 'club', 'contact', 'message'];

/** Validate the form and keep it in `store`. Never sends anything anywhere else. */
export async function submitContact(
  formData: FormData,
  store: ContactStore,
): Promise<ContactFormState> {
  const raw = Object.fromEntries(fields.map((f) => [f, String(formData.get(f) ?? '')]));
  const parsed = contactSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<ContactField, MessageKey>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as ContactField;
      fieldErrors[field] ??= issue.message as MessageKey;
    }
    return { status: 'error', fieldErrors };
  }
  try {
    await store.save(parsed.data);
    return { status: 'success' };
  } catch {
    return { status: 'error', fieldErrors: {}, formError: 'contact.error.saveFailed' };
  }
}
