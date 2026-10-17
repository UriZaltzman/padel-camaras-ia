// TypeScript generation from the OpenAPI contract. Shared by generate.mjs and the tests, so
// the test that mutates the contract uses exactly the same pipeline as `pnpm contracts:generate`.
import openapiTS, { astToString } from 'openapi-typescript';
import * as prettier from 'prettier';

export const TS_OUTPUT = new URL('../generated/typescript/schema.ts', import.meta.url);

const HEADER = `/**
 * Generated from packages/contracts/openapi/openapi.yaml by \`pnpm contracts:generate\`.
 * Do not edit: change the contract and regenerate.
 */

`;

/**
 * Generate the TypeScript types for a contract.
 * @param {URL | string | object} spec URL of the YAML file, YAML text or a parsed document.
 * @returns {Promise<string>} Formatted source of generated/typescript/schema.ts.
 */
export async function generateTypeScript(spec) {
  const ast = await openapiTS(spec, {
    // `SchemaError`, `SchemaErrorCode`, `ResponseBadRequest`... next to `components[...]`.
    rootTypes: true,
    silent: true,
  });
  const source = HEADER + astToString(ast);
  const config = await prettier.resolveConfig(TS_OUTPUT);
  return prettier.format(source, { ...config, parser: 'typescript' });
}
