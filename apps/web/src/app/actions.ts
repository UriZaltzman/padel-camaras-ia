'use server';

import { getContactStore } from '@/lib/contact/store';
import { submitContact, type ContactFormState } from '@/lib/contact/submit';

export async function sendContact(
  _previous: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  return submitContact(formData, getContactStore());
}
