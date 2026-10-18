/** Item `index` of `list` for tests; throws instead of returning undefined. */
export function nth<T>(list: readonly T[], index: number): T {
  const item = list[index];
  if (item === undefined) throw new Error(`No item at index ${index}`);
  return item;
}
