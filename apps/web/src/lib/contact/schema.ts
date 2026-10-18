import { z } from 'zod';

import type { MessageKey } from '@/i18n';

// Error messages are es-AR message keys; the form translates them with t().
const msg = (key: MessageKey) => ({ message: key });
const required = (key: MessageKey) => z.string().trim().min(1, msg(key));

const phone = /^\+?[\d\s()-]{8,20}$/;
const email = z.email();

export const contactSchema = z.object({
  name: required('contact.error.nameRequired').max(120, msg('contact.error.tooLong')),
  club: required('contact.error.clubRequired').max(120, msg('contact.error.tooLong')),
  contact: required('contact.error.contactRequired').refine(
    (value) => phone.test(value) || email.safeParse(value).success,
    msg('contact.error.contactInvalid'),
  ),
  message: z.string().trim().max(2000, msg('contact.error.tooLong')),
});

export type ContactInput = z.infer<typeof contactSchema>;
export type ContactField = keyof ContactInput;
