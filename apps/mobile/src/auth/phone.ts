// Argentine mobile numbers as people type them ("11 5555-0123", "011 15 5555 0123") to the
// E.164 WhatsApp format of the contract (`+5491155550123`).
const E164 = /^\+[1-9][0-9]{7,14}$/;

export function toE164(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  let phone: string;
  if (trimmed.startsWith('+')) {
    phone = `+${digits}`;
  } else if (digits.startsWith('54')) {
    phone = `+${digits}`;
  } else {
    // Local format: drop the trunk 0 and the old mobile "15" after a 2-4 digit area code.
    let local = digits.replace(/^0/, '');
    const match = /^(\d{2,4}?)15(\d{6,8})$/.exec(local);
    if (match && local.length === 12) local = `${match[1]}${match[2]}`;
    phone = `+549${local}`;
  }
  return E164.test(phone) ? phone : null;
}
