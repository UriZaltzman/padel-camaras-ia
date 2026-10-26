'use client';

// Responsive layout primitives (plan section 2). They style with Tailwind classes, so the app that
// renders them must scan this folder (`@source` in apps/web/src/app/globals.css). Text comes in
// through props: this package holds no user-facing copy.
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from 'react';

import { breakpoints, deviceClass, visibleCourts, type DeviceClass } from '../breakpoints';

/** `matchMedia` as React state. The server and the hydration render say "no match" (phone first). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      if (typeof window.matchMedia !== 'function') return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    // Without `matchMedia` (jsdom, old embedded views) the full layout is the safe one.
    () => typeof window.matchMedia !== 'function' || window.matchMedia(query).matches,
    () => false,
  );
}

/** Current device class from the viewport width; `phone` until the client takes over. */
export function useDeviceClass(): DeviceClass {
  const tablet = useMediaQuery(`(min-width: ${breakpoints.tablet}px)`);
  const laptop = useMediaQuery(`(min-width: ${breakpoints.laptop}px)`);
  const wide = useMediaQuery(`(min-width: ${breakpoints.wide}px)`);
  return wide ? 'wide' : laptop ? 'laptop' : tablet ? 'tablet' : 'phone';
}

/** How many courts of the booking grid fit at the current width (1 phone, 2-3 tablet, all). */
export function useVisibleCourts(totalCourts: number): number {
  const tablet = useMediaQuery(`(min-width: ${breakpoints.tablet}px)`);
  const wideTablet = useMediaQuery('(min-width: 800px)');
  const laptop = useMediaQuery(`(min-width: ${breakpoints.laptop}px)`);
  // Same rule as `visibleCourts`, expressed with the three queries so it re-renders on change.
  const width = laptop ? breakpoints.laptop : wideTablet ? 800 : tablet ? breakpoints.tablet : 0;
  return visibleCourts(width, totalCourts);
}

export { deviceClass };

/** Page content: fluid width with the side gutters that respect the notch in landscape. */
export function Container({
  children,
  className = '',
  size = 'default',
}: {
  children: ReactNode;
  className?: string;
  size?: 'narrow' | 'default' | 'wide';
}) {
  const max = size === 'narrow' ? 'max-w-xl' : size === 'wide' ? 'max-w-7xl' : 'max-w-5xl';
  return (
    <div
      className={`mx-auto w-full ${max} pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] ${className}`}
    >
      {children}
    </div>
  );
}

export interface NavItem {
  href: string;
  label: string;
}

export type NavLinkComponent = ComponentType<{
  href: string;
  className?: string;
  'aria-current'?: 'page';
  onClick?: () => void;
  children: ReactNode;
}>;

export interface ShellLabels {
  /** Accessible name of the navigation landmark. */
  nav: string;
  /** Button that opens the drawer. */
  openMenu: string;
  /** Button that closes the drawer. */
  closeMenu: string;
}

export interface PanelShellProps {
  title: string;
  items: NavItem[];
  /** `href` of the current page, to mark it. */
  currentHref?: string;
  labels: ShellLabels;
  /** Link component, e.g. `next/link`; a plain `<a>` by default. */
  linkComponent?: NavLinkComponent;
  variant?: 'panel' | 'console';
  /** Strip shown above everything, e.g. a "not for production" notice. */
  banner?: ReactNode;
  children: ReactNode;
}

const PlainLink: NavLinkComponent = ({ children, ...rest }) => <a {...rest}>{children}</a>;

/**
 * Shell of the club panel and the console. Laptop and up: fixed side navigation. Below: a top bar
 * with a menu button that opens the navigation as a drawer (the same on tablet and phone).
 */
export function PanelShell({
  title,
  items,
  currentHref,
  labels,
  linkComponent: Link = PlainLink,
  variant = 'panel',
  banner,
  children,
}: PanelShellProps) {
  const [open, setOpen] = useState(false);
  const drawerId = useId();
  const menuButton = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    menuButton.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  const dark = variant === 'console';
  const navTone = dark ? 'bg-night text-white' : 'bg-white text-night';
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row" data-shell={variant}>
      <div className="print:hidden lg:hidden">
        <header
          className={`sticky top-0 z-20 flex items-center gap-3 border-b border-line pt-[env(safe-area-inset-top)] pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] ${navTone}`}
        >
          <button
            ref={menuButton}
            type="button"
            aria-expanded={open}
            aria-controls={drawerId}
            onClick={() => setOpen(true)}
            className="-ml-2 flex size-11 items-center justify-center rounded-xl"
          >
            <span className="sr-only">{labels.openMenu}</span>
            <svg
              viewBox="0 0 24 24"
              className="size-6"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <span className="truncate font-display text-lg font-black">{title}</span>
        </header>
      </div>

      {open && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={close}
          className="fixed inset-0 z-30 bg-night/60 lg:hidden"
        />
      )}
      <nav
        id={drawerId}
        aria-label={labels.nav}
        className={`${open ? 'flex' : 'hidden'} fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] flex-col gap-1 overflow-y-auto border-r border-line p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] print:hidden lg:sticky lg:top-0 lg:z-auto lg:flex lg:h-dvh lg:max-w-none lg:shrink-0 ${navTone}`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="truncate px-2 font-display text-lg font-black">{title}</span>
          <button
            type="button"
            onClick={close}
            className="flex size-11 items-center justify-center rounded-xl lg:hidden"
          >
            <span className="sr-only">{labels.closeMenu}</span>
            <svg
              viewBox="0 0 24 24"
              className="size-6"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {items.map((item) => {
          const current = item.href === currentHref;
          return (
            <Link
              key={item.href}
              href={item.href}
              {...(current ? { 'aria-current': 'page' as const } : {})}
              onClick={() => setOpen(false)}
              className={`flex min-h-11 items-center rounded-xl px-3 font-semibold ${
                current ? (dark ? 'bg-ink2' : 'bg-glass text-court') : ''
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        {banner}
        <div className="min-w-0 flex-1 pb-[env(safe-area-inset-bottom)]">{children}</div>
      </div>
    </div>
  );
}

/** The console shell: the panel shell with the dark navigation of the internal tools. */
export function ConsoleShell(props: Omit<PanelShellProps, 'variant'>) {
  return <PanelShell {...props} variant="console" />;
}

export interface TableColumn<Row> {
  key: string;
  header: string;
  cell: (row: Row) => ReactNode;
  /** The column that titles the card on a phone; the first one by default. */
  primary?: boolean;
}

export interface ResponsiveTableProps<Row> {
  caption: string;
  columns: TableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  className?: string;
}

/**
 * Table that becomes a list of cards on a phone (each row stacked as label and value) and, when it
 * is still too wide, scrolls inside its own box instead of widening the page.
 */
export function ResponsiveTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  className = '',
}: ResponsiveTableProps<Row>) {
  const asTable = useMediaQuery(`(min-width: ${breakpoints.tablet}px)`);
  const primary = columns.find((c) => c.primary) ?? columns[0];

  if (!asTable) {
    return (
      <ul aria-label={caption} className={`flex flex-col gap-3 ${className}`} data-layout="cards">
        {rows.map((row) => (
          <li key={rowKey(row)} className="rounded-2xl border border-line bg-white p-4">
            {primary && <p className="font-semibold break-words">{primary.cell(row)}</p>}
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {columns
                .filter((c) => c !== primary)
                .map((c) => (
                  <div key={c.key} className="contents">
                    <dt className="text-ink3">{c.header}</dt>
                    <dd className="min-w-0 break-words">{c.cell(row)}</dd>
                  </div>
                ))}
            </dl>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div
      className={`overflow-x-auto rounded-xl border border-line bg-white ${className}`}
      data-layout="table"
      // A scrollable region must be reachable with the keyboard.
      tabIndex={0}
      role="region"
      aria-label={caption}
    >
      <table className="w-full min-w-max border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className="border-b border-line px-3 py-2 font-semibold">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td key={c.key} className="border-b border-line px-3 py-2 align-top">
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Accessible name of the corner close button; leave out when the content has its own. */
  closeLabel?: string;
  children: ReactNode;
}

/** Modal that rises from the bottom as a sheet on a phone and is a centered dialog from tablet. */
export function Sheet({ open, onClose, title, closeLabel, children }: SheetProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-night/60 sm:items-center sm:p-4">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-sheet
        className="flex max-h-[92dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-2xl bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] focus:outline-none sm:max-w-md sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="font-display text-2xl font-bold">
            {title}
          </h2>
          {closeLabel && (
            <button
              type="button"
              onClick={onClose}
              className="-mt-2 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-xl"
            >
              <span className="sr-only">{closeLabel}</span>
              <svg
                viewBox="0 0 24 24"
                className="size-6"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
