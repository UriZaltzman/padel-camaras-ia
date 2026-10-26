import AxeBuilder from '@axe-core/playwright';
import { existsSync } from 'node:fs';
import { expect, test as base, type Page } from '@playwright/test';

/** Smallest size of anything that is touched; keep in sync with `touchTargetPx` in @app/ui. */
export const TOUCH_TARGET_PX = 44;

const consoleErrors = new WeakMap<Page, string[]>();

/** `test` that records every console error and uncaught exception of each page. */
export const test = base.extend<{ recordConsole: undefined }>({
  recordConsole: [
    async ({ page }, use) => {
      const errors: string[] = [];
      consoleErrors.set(page, errors);
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(`console: ${message.text()}`);
      });
      page.on('pageerror', (error) => errors.push(`exception: ${error.message}`));
      await use(undefined);
    },
    { auto: true },
  ],
});

/** Tag a test with the screen id of e2e/coverage-map.json (the coverage check looks for it). */
export const screenTitle = (id: string, title: string) => `[screen:${id}] ${title}`;

interface Offender {
  selector: string;
  detail: string;
}

/** Reads the page once, in the browser, for the three geometry rules. */
async function measure(page: Page) {
  return page.evaluate((minTouch) => {
    const describe = (el: Element) => {
      const id = el.id ? `#${el.id}` : '';
      const cls =
        typeof el.className === 'string' && el.className
          ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
          : '';
      const label = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 30);
      return `${el.tagName.toLowerCase()}${id}${cls}${label ? ` "${label}"` : ''}`;
    };
    const root = document.documentElement;
    const viewport = root.clientWidth;
    const visible = (el: Element) => {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    // An element inside a box that scrolls on its own may stick out of the viewport.
    const insideOwnScroller = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body && p !== root; p = p.parentElement) {
        const { overflowX } = getComputedStyle(p);
        if (overflowX !== 'visible') return true;
      }
      return false;
    };
    const clipped: { selector: string; detail: string }[] = [];
    const small: { selector: string; detail: string }[] = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (!visible(el) || el.closest('[aria-hidden="true"]')) continue;
      const r = el.getBoundingClientRect();
      if (!insideOwnScroller(el) && (r.right > viewport + 1 || r.left < -1)) {
        clipped.push({
          selector: describe(el),
          detail: `x ${Math.round(r.left)}..${Math.round(r.right)} of ${viewport}`,
        });
      }
      const isControl = el.matches(
        'button, a[href], select, summary, [role="button"], [role="tab"], input:not([type="hidden"], [type="checkbox"], [type="radio"])',
      );
      if (!isControl) continue;
      // A link inside a sentence is exempt (WCAG 2.5.8 "inline").
      if (el.matches('a') && getComputedStyle(el).display === 'inline') continue;
      if (r.width < minTouch - 0.5 || r.height < minTouch - 0.5) {
        small.push({
          selector: describe(el),
          detail: `${Math.round(r.width)}x${Math.round(r.height)}`,
        });
      }
    }
    return {
      scrollWidth: root.scrollWidth,
      clientWidth: viewport,
      clipped: clipped.slice(0, 10),
      small: small.slice(0, 10),
    };
  }, TOUCH_TARGET_PX);
}

const lines = (items: Offender[]) => items.map((o) => `  ${o.selector} (${o.detail})`).join('\n');

/**
 * The rules every screen must pass on every device (plan section 2): the page does not scroll
 * sideways, nothing sticks out of the viewport (boxes that scroll on their own are exempt), every
 * touch target is at least 44 px, and the console has no errors.
 */
export async function expectResponsive(page: Page) {
  await page.waitForLoadState('networkidle');
  const m = await measure(page);
  const problems: string[] = [];
  if (m.scrollWidth > m.clientWidth + 1) {
    problems.push(`page scrolls sideways: scrollWidth ${m.scrollWidth} > ${m.clientWidth}`);
  }
  if (m.clipped.length > 0) problems.push(`clipped outside the viewport:\n${lines(m.clipped)}`);
  if (m.small.length > 0) problems.push(`touch targets under 44 px:\n${lines(m.small)}`);
  const errors = consoleErrors.get(page) ?? [];
  if (errors.length > 0) problems.push(`console errors:\n  ${errors.join('\n  ')}`);
  expect(problems, problems.join('\n')).toEqual([]);
}

/** axe-core (MPL-2.0, allowed by tests/licenses/policy.yaml): no serious or critical violations. */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  const report = serious
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help}\n${v.nodes
          .slice(0, 3)
          .map((n) => `    ${n.target.join(' ')}`)
          .join('\n')}`,
    )
    .join('\n');
  expect(serious, report).toEqual([]);
}

/**
 * Screenshot against the approved one, tolerating 2 % of changed pixels (see playwright.config.ts).
 * Baselines are per OS and device and are not committed for every OS: when there is none for this
 * OS the screenshot is attached to the report and nothing is compared.
 * Create or refresh baselines with `--update-snapshots`.
 */
export async function expectScreenshot(page: Page, name: string) {
  const info = test.info();
  const updating =
    info.config.updateSnapshots === 'all' || info.config.updateSnapshots === 'changed';
  const baseline = info.snapshotPath(`${name}.png`);
  if (!updating && !existsSync(baseline)) {
    await info.attach(`${name}.png`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
    return;
  }
  await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true });
}
