// The contract is the compile-time boundary: these tests regenerate the TypeScript types in
// memory, with exactly the pipeline of `pnpm contracts:generate`, and type-check a consumer
// (test/fixtures/consumer.ts) against them.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

import ts from 'typescript';
import YAML from 'yaml';

import { generateTypeScript, TS_OUTPUT } from '../scripts/typescript.mjs';

const SPEC = new URL('../openapi/openapi.yaml', import.meta.url);
const CONSUMER = fileURLToPath(new URL('./fixtures/consumer.ts', import.meta.url));
const TSCONFIG = fileURLToPath(new URL('../tsconfig.json', import.meta.url));
const SCHEMA_PATH = fileURLToPath(TS_OUTPUT);

async function loadContract() {
  return YAML.parse(await readFile(SPEC, 'utf8'));
}

/** Type-check the consumer with `schema.ts` replaced by `schemaSource`; return the errors. */
function compileConsumer(schemaSource) {
  const config = ts.getParsedCommandLineOfConfigFile(
    TSCONFIG,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
      },
    },
  );
  const host = ts.createCompilerHost(config.options);
  const isSchema = (fileName) => ts.sys.resolvePath(fileName) === SCHEMA_PATH;
  const { readFile: read, fileExists } = host;
  host.readFile = (fileName) => (isSchema(fileName) ? schemaSource : read(fileName));
  host.fileExists = (fileName) => isSchema(fileName) || fileExists(fileName);
  const getSourceFile = host.getSourceFile;
  host.getSourceFile = (fileName, languageVersion, ...rest) =>
    isSchema(fileName)
      ? ts.createSourceFile(fileName, schemaSource, languageVersion, true)
      : getSourceFile(fileName, languageVersion, ...rest);

  const program = ts.createProgram([CONSUMER], config.options, host);
  return ts
    .getPreEmitDiagnostics(program)
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

async function compileWith(mutate) {
  const contract = await loadContract();
  mutate(contract);
  return compileConsumer(await generateTypeScript(contract));
}

describe('generated TypeScript', () => {
  test('matches the committed generated/typescript/schema.ts (no drift)', async () => {
    const committed = await readFile(TS_OUTPUT, 'utf8');
    assert.equal(
      await generateTypeScript(SPEC),
      committed,
      'Run `pnpm contracts:generate` and commit the result.',
    );
  });
});

describe('TypeScript consumer', () => {
  test('compiles against the current contract', async () => {
    assert.deepEqual(await compileWith((contract) => contract), []);
  });

  test('still compiles after an additive change (new optional field)', async () => {
    const errors = await compileWith((contract) => {
      contract.components.schemas.Error.properties.trace_id = { type: 'string' };
    });
    assert.deepEqual(errors, []);
  });

  test('breaks when a required field is renamed', async () => {
    const errors = await compileWith((contract) => {
      const error = contract.components.schemas.Error;
      error.properties.text = error.properties.message;
      delete error.properties.message;
      error.required = error.required.map((name) => (name === 'message' ? 'text' : name));
    });
    assert.ok(
      errors.some((e) => e.includes("'message'")),
      `expected an error about 'message', got: ${errors.join(' | ')}`,
    );
  });

  test('breaks when an enum value the consumer uses is removed', async () => {
    const errors = await compileWith((contract) => {
      const codes = contract.components.schemas.ErrorCode;
      codes.enum = codes.enum.filter((code) => code !== 'BOOKING_SLOT_TAKEN');
    });
    assert.ok(
      errors.some((e) => e.includes('BOOKING_SLOT_TAKEN')),
      `expected an error about BOOKING_SLOT_TAKEN, got: ${errors.join(' | ')}`,
    );
  });
});
