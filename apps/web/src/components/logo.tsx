import { brand } from '@app/config/brand';

import { t } from '@/i18n';

/** Symbol from docs/marca.md, colored with the Tailwind brand tokens. */
export function LogoSymbol({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label={t('home.logoLabel')} className={className}>
      <rect width="64" height="64" rx="16" className="fill-court" />
      <path
        d="M14 16 L30 44 L48 22"
        fill="none"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-white"
      />
      <circle cx="48" cy="18" r="6" className="fill-ball" />
    </svg>
  );
}

/** Wordmark: the name in Archivo 900, lowercase, followed by a dot (yellow on dark backgrounds). */
export function Wordmark() {
  return (
    <span className="font-display text-2xl font-black tracking-display lowercase">
      {brand.name}
      <span className="text-ball">.</span>
    </span>
  );
}
