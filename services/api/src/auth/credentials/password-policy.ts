import { COMMON_PASSWORDS } from './common-passwords';

export const PASSWORD_MIN_LENGTH = 10;
/** Not a security limit (the pepper step hashes any length to a fixed size): it only bounds request bodies. */
export const PASSWORD_MAX_LENGTH = 1024;

export type PasswordProblem = 'too_short' | 'too_long' | 'too_common' | 'contains_email';

/** NFKC so the same text typed on two keyboards (composed/decomposed accents) is one password. */
export function normalizePassword(password: string): string {
  return password.normalize('NFKC');
}

/**
 * Length counts characters, not bytes, and any Unicode is allowed, spaces included. There are no
 * composition rules ("one uppercase, one digit"): they push people to predictable passwords.
 */
export function checkPassword(
  password: string,
  context: { email?: string } = {},
): PasswordProblem[] {
  const normalized = normalizePassword(password);
  const length = [...normalized].length;
  const problems: PasswordProblem[] = [];
  if (length < PASSWORD_MIN_LENGTH) problems.push('too_short');
  if (length > PASSWORD_MAX_LENGTH) problems.push('too_long');
  const lower = normalized.toLowerCase();
  if (COMMON_PASSWORDS.has(lower) || new Set(lower).size === 1 || isSimpleSequence(lower)) {
    problems.push('too_common');
  }
  const local = context.email?.split('@')[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) problems.push('contains_email');
  return problems;
}

/** `abcdefghijk`, `12345678901`, `987654321098`: each char is the previous one +1 or -1. */
function isSimpleSequence(value: string): boolean {
  const codes = [...value].map((c) => c.codePointAt(0) ?? 0);
  if (codes.length < PASSWORD_MIN_LENGTH) return false;
  const steps = codes.slice(1).map((code, i) => code - (codes[i] ?? 0));
  return steps.every((s) => s === 1) || steps.every((s) => s === -1);
}
