// Domain events of section 11, defined as JSON Schema 2020-12 in events/*.schema.json. This module
// loads them and bundles them into one OpenAPI 3.1 document (whose schema dialect is JSON Schema
// 2020-12), so the same tools that generate the API types also generate the event types:
// openapi-typescript -> generated/typescript/events.ts, datamodel-code-generator ->
// generated/python/app_contracts/events.py. Shared by generate.mjs and the tests.
import { readdir, readFile } from 'node:fs/promises';

import openapiTS, { astToString } from 'openapi-typescript';
import * as prettier from 'prettier';

export const EVENTS_DIR = new URL('../events/', import.meta.url);
export const TS_EVENTS_OUTPUT = new URL('../generated/typescript/events.ts', import.meta.url);
export const PY_EVENTS_OUTPUT = 'generated/python/app_contracts/events.py';

const COMMON_FILE = 'common.schema.json';
const SUFFIX = '.schema.json';

/**
 * @typedef {object} EventSchema
 * @property {string} type Event name, e.g. `booking.confirmed`.
 * @property {string} title Schema title, e.g. `BookingConfirmedEvent`.
 * @property {any} schema The parsed JSON Schema.
 */

/**
 * Read the shared definitions and every event schema, sorted by event name.
 * @returns {Promise<{ common: any, events: EventSchema[] }>}
 */
export async function loadEventSchemas() {
  const files = (await readdir(EVENTS_DIR)).filter((f) => f.endsWith(SUFFIX)).sort();
  const read = async (file) => JSON.parse(await readFile(new URL(file, EVENTS_DIR), 'utf8'));
  const common = await read(COMMON_FILE);
  const events = [];
  for (const file of files) {
    if (file === COMMON_FILE) continue;
    const schema = await read(file);
    const type = file.slice(0, -SUFFIX.length);
    if (schema.properties?.event_type?.const !== type) {
      throw new Error(`contracts: events/${file}: event_type.const must be "${type}"`);
    }
    events.push({ type, title: schema.title, schema });
  }
  return { common, events };
}

/** Rewrite `common.schema.json#/$defs/X` (and nested schemas) to `#/components/schemas/X`. */
function rewriteRefs(node) {
  if (Array.isArray(node)) return node.map(rewriteRefs);
  if (node === null || typeof node !== 'object') return node;
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === '$schema' || key === '$id' || key === 'examples') continue;
    if (key === '$ref') {
      const match = /^common\.schema\.json#\/\$defs\/(\w+)$/.exec(value);
      if (!match) throw new Error(`contracts: unsupported $ref ${value} in events/`);
      out.$ref = `#/components/schemas/${match[1]}`;
    } else {
      out[key] = rewriteRefs(value);
    }
  }
  return out;
}

/**
 * One OpenAPI 3.1 document with the shared definitions, every event and the `DomainEvent` union.
 *
 * Pydantic cannot combine `format` and `pattern` on one field, so for `python` the bundle keeps
 * `Uuid` a pattern-checked string (the UUID v7 check matters more than the `UUID` class) and
 * `Timestamp` an aware datetime (consumers want a datetime; producers write UTC).
 * @param {{ common: any, events: EventSchema[] }} loaded
 * @param {'typescript' | 'python'} [target]
 * @returns {object}
 */
export function bundleEvents({ common, events }, target = 'typescript') {
  const schemas = {};
  for (const [name, def] of Object.entries(common.$defs)) schemas[name] = rewriteRefs(def);
  if (target === 'python') {
    delete schemas.Uuid.format;
    delete schemas.Timestamp.pattern;
  }
  for (const { title, schema } of events) schemas[title] = rewriteRefs(schema);
  schemas.EventType = {
    type: 'string',
    description: 'Name of a domain event (section 11).',
    enum: events.map((e) => e.type),
  };
  schemas.DomainEvent = {
    description: 'Any domain event, discriminated by `event_type`.',
    oneOf: events.map((e) => ({ $ref: `#/components/schemas/${e.title}` })),
    discriminator: {
      propertyName: 'event_type',
      mapping: Object.fromEntries(events.map((e) => [e.type, `#/components/schemas/${e.title}`])),
    },
  };
  return {
    openapi: '3.1.0',
    info: { title: 'Domain events', version: '1' },
    paths: {},
    components: { schemas },
  };
}

const HEADER = `/**
 * Generated from packages/contracts/events/*.schema.json by \`pnpm contracts:generate\`.
 * Do not edit: change the event schemas and regenerate.
 */

`;

/**
 * TypeScript source of generated/typescript/events.ts.
 * @param {{ common: any, events: EventSchema[] }} loaded
 * @returns {Promise<string>}
 */
export async function generateEventsTs(loaded) {
  const ast = await openapiTS(bundleEvents(loaded), {
    rootTypes: true,
    rootTypesNoSchemaPrefix: true,
    silent: true,
  });
  const names = loaded.events.map((e) => `  '${e.type}',`).join('\n');
  const source = `${HEADER}${astToString(ast)}
/** Every domain event name, in the order of events/. */
export const EVENT_TYPES = [
${names}
] as const satisfies readonly EventType[];
`;
  const config = await prettier.resolveConfig(TS_EVENTS_OUTPUT);
  return prettier.format(source, { ...config, parser: 'typescript' });
}
