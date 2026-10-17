/**
 * Checks that the `ErrorCode` enum and its `x-error-catalog` describe exactly the same codes,
 * each once, with a valid HTTP status and a description.
 *
 * @param {{ enum?: unknown[], 'x-error-catalog'?: unknown[] }} schema
 */
export default function errorCatalog(schema) {
  const results = [];
  const codes = Array.isArray(schema?.enum) ? schema.enum : [];
  const catalog = Array.isArray(schema?.['x-error-catalog']) ? schema['x-error-catalog'] : null;

  if (catalog === null) {
    return [{ message: '`ErrorCode` must have an `x-error-catalog` array.' }];
  }

  const seen = new Set();
  catalog.forEach((entry, index) => {
    const path = ['x-error-catalog', index];
    if (typeof entry?.code !== 'string') {
      results.push({ message: 'Catalog entry needs a `code`.', path });
      return;
    }
    if (seen.has(entry.code)) {
      results.push({ message: `Duplicate catalog entry for ${entry.code}.`, path });
    }
    seen.add(entry.code);
    if (!codes.includes(entry.code)) {
      results.push({ message: `${entry.code} is in the catalog but not in the enum.`, path });
    }
    if (
      !Number.isInteger(entry.http_status) ||
      entry.http_status < 400 ||
      entry.http_status > 599
    ) {
      results.push({
        message: `${entry.code} needs an \`http_status\` between 400 and 599.`,
        path,
      });
    }
    if (typeof entry.description !== 'string' || entry.description.trim() === '') {
      results.push({ message: `${entry.code} needs a \`description\`.`, path });
    }
  });

  if (new Set(codes).size !== codes.length) {
    results.push({ message: 'The `ErrorCode` enum has duplicate values.', path: ['enum'] });
  }
  codes.forEach((code, index) => {
    if (!seen.has(code)) {
      results.push({
        message: `${code} is in the enum but not in the catalog.`,
        path: ['enum', index],
      });
    }
  });

  return results;
}
