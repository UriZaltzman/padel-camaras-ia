// TODO(web-paneles): move field styles to packages/ui once shared form components land there.
export const inputClass =
  'min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-night focus:border-court focus:outline-2 focus:outline-court aria-invalid:border-alert';
// Orange on white does not reach AA for text, so errors are night text with an alert marker.
export const errorClass = 'border-l-4 border-alert pl-2 text-sm font-semibold text-night';
export const labelClass = 'flex flex-col gap-2 font-semibold';
