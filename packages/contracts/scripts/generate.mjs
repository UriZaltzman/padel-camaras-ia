// `pnpm contracts:generate`: regenerates every type derived from openapi/openapi.yaml.
//
// - generated/typescript/schema.ts      openapi-typescript (MIT), used by api, web and mobile.
// - generated/python/app_contracts/     datamodel-code-generator (MIT), Pydantic v2 models used by
//                                       edge-agent and ml. Pinned in python/requirements-codegen.txt.
//
// The output is committed. CI runs this script and fails if `git diff` shows any change.
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateTypeScript, TS_OUTPUT } from './typescript.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SPEC = new URL('../openapi/openapi.yaml', import.meta.url);
const PY_OUTPUT = 'generated/python/app_contracts/models.py';

const PY_HEADER = `# Generated from packages/contracts/openapi/openapi.yaml by \`pnpm contracts:generate\`.
# Do not edit: change the contract and regenerate.`;

async function typescript() {
  const output = fileURLToPath(TS_OUTPUT);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, await generateTypeScript(SPEC));
  console.warn(`contracts: wrote ${output}`);
}

function python() {
  const args = [
    'run',
    '--no-project',
    '--isolated',
    '--python',
    '3.12',
    '--with-requirements',
    'python/requirements-codegen.txt',
    'datamodel-codegen',
    '--input',
    'openapi/openapi.yaml',
    '--input-file-type',
    'openapi',
    '--output',
    PY_OUTPUT,
    '--output-model-type',
    'pydantic_v2.BaseModel',
    '--target-python-version',
    '3.12',
    '--custom-file-header',
    PY_HEADER,
    '--disable-timestamp',
    '--use-annotated',
    '--field-constraints',
    '--use-standard-collections',
    '--use-union-operator',
    '--use-subclass-enum',
    '--use-schema-description',
    '--use-field-description',
    '--use-double-quotes',
    '--output-datetime-class',
    'AwareDatetime',
    '--formatters',
    'ruff-format',
    'ruff-check',
  ];
  const result = spawnSync('uv', args, { cwd: ROOT, stdio: 'inherit' });
  if (result.error) {
    throw new Error(
      `contracts: could not run uv (${result.error.message}). Install uv: https://docs.astral.sh/uv/`,
    );
  }
  if (result.status !== 0) {
    throw new Error(`contracts: datamodel-codegen failed with exit code ${result.status}`);
  }
  console.warn(`contracts: wrote ${PY_OUTPUT}`);
}

await typescript();
python();
