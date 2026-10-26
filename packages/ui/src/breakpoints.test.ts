import { describe, expect, it } from 'vitest';

import { deviceClass, visibleCourts } from './breakpoints';

describe('deviceClass', () => {
  it.each([
    [320, 'phone'],
    [639, 'phone'],
    [640, 'tablet'],
    [1023, 'tablet'],
    [1024, 'laptop'],
    [1439, 'laptop'],
    [1440, 'wide'],
  ] as const)('%ipx is %s', (width, expected) => {
    expect(deviceClass(width)).toBe(expected);
  });
});

describe('visibleCourts', () => {
  it('shows one court on a phone', () => expect(visibleCourts(375, 6)).toBe(1));
  it('shows two or three on a tablet', () => {
    expect(visibleCourts(700, 6)).toBe(2);
    expect(visibleCourts(900, 6)).toBe(3);
  });
  it('shows all from the laptop up', () => {
    expect(visibleCourts(1024, 6)).toBe(6);
    expect(visibleCourts(1440, 6)).toBe(6);
  });
  it('never shows more courts than exist', () => {
    expect(visibleCourts(375, 0)).toBe(0);
    expect(visibleCourts(900, 2)).toBe(2);
  });
});
