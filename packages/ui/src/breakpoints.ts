// Responsive rules shared by web and mobile (plan section 2). Written once here; the web copies the
// same numbers into Tailwind in apps/web/src/app/responsive.css and a test keeps both in sync.

/** Minimum widths in px: phone is everything below `tablet`. */
export const breakpoints = { tablet: 640, laptop: 1024, wide: 1440 } as const;

export type DeviceClass = 'phone' | 'tablet' | 'laptop' | 'wide';

/** Smallest size of anything that is touched, in px (WCAG 2.5.5 / Apple HIG). */
export const touchTargetPx = 44;

/** Text fields use at least this size so iOS Safari does not zoom in when one is focused. */
export const minInputFontPx = 16;

export function deviceClass(widthPx: number): DeviceClass {
  if (widthPx >= breakpoints.wide) return 'wide';
  if (widthPx >= breakpoints.laptop) return 'laptop';
  if (widthPx >= breakpoints.tablet) return 'tablet';
  return 'phone';
}

/** Booking grid: one court at a time on a phone, two on a tablet that is narrower than a laptop,
 * three on a wide tablet, and every court from the laptop up. */
export function visibleCourts(widthPx: number, totalCourts: number): number {
  const total = Math.max(0, Math.floor(totalCourts));
  switch (deviceClass(widthPx)) {
    case 'phone':
      return Math.min(1, total);
    case 'tablet':
      return Math.min(widthPx >= 800 ? 3 : 2, total);
    default:
      return total;
  }
}
