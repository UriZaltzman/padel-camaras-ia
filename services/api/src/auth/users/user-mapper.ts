import type { User } from '@prisma/client';

/** The contract's `User` (own profile). */
export interface ApiUser {
  id: string;
  display_name: string;
  phone: string | null;
  email: string | null;
  photo_url: string | null;
  declared_category: string | null;
  dominant_hand: 'right' | 'left' | null;
  playing_side: 'drive' | 'reves' | 'both' | null;
  birth_date: string | null;
  training_opt_out: boolean;
  terms_version: string;
  terms_accepted_at: string;
  privacy_version: string;
  created_at: string;
}

export function toApiUser(user: User): ApiUser {
  return {
    id: user.id,
    display_name: user.name,
    phone: user.phone,
    email: user.email,
    photo_url: user.photoUrl,
    // The database stores `cat_8`..`cat_1`; the API says `8`..`1`.
    declared_category: user.declaredCategory ? user.declaredCategory.replace('cat_', '') : null,
    dominant_hand: user.handedness,
    playing_side: user.playingSide,
    birth_date: user.birthDate ? user.birthDate.toISOString().slice(0, 10) : null,
    training_opt_out: user.trainingOptOut,
    terms_version: user.termsVersion ?? '',
    terms_accepted_at: (user.termsAcceptedAt ?? user.createdAt).toISOString(),
    privacy_version: user.privacyVersion ?? '',
    created_at: user.createdAt.toISOString(),
  };
}
