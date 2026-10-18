// `pnpm contracts:generate`: regenerates every type derived from openapi/openapi.yaml.
//
// - generated/typescript/schema.ts      openapi-typescript (MIT), used by api, web and mobile.
// - generated/python/app_contracts/     datamodel-code-generator (MIT), Pydantic v2 models used by
//                                       edge-agent and ml. Pinned in python/requirements-codegen.txt.
// - state-machines.ts / state_machines.py  transition tables of section 3, from `x-state-machine`
//                                       (scripts/state-machines.mjs).
//
// The output is committed. CI runs this script and fails if `git diff` shows any change.
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import YAML from 'yaml';

import {
  generateStateMachinesPy,
  generateStateMachinesTs,
  loadStateMachines,
  PY_STATE_MACHINES_OUTPUT,
  TS_STATE_MACHINES_OUTPUT,
} from './state-machines.mjs';
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

/** `uv run` with the pinned codegen requirements (datamodel-code-generator, ruff). */
function uvRun(tool, toolArgs) {
  const args = [
    'run',
    '--no-project',
    '--isolated',
    '--python',
    '3.12',
    '--with-requirements',
    'python/requirements-codegen.txt',
    tool,
    ...toolArgs,
  ];
  const result = spawnSync('uv', args, { cwd: ROOT, stdio: 'inherit' });
  if (result.error) {
    throw new Error(
      `contracts: could not run uv (${result.error.message}). Install uv: https://docs.astral.sh/uv/`,
    );
  }
  if (result.status !== 0) {
    throw new Error(`contracts: ${tool} failed with exit code ${result.status}`);
  }
}

function python() {
  uvRun('datamodel-codegen', [
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
  ]);
  console.warn(`contracts: wrote ${PY_OUTPUT}`);
}

async function stateMachines() {
  const machines = loadStateMachines(YAML.parse(await readFile(SPEC, 'utf8')));

  const tsOutput = fileURLToPath(TS_STATE_MACHINES_OUTPUT);
  await writeFile(tsOutput, await generateStateMachinesTs(machines));
  console.warn(`contracts: wrote ${tsOutput}`);

  await writeFile(
    new URL(`../${PY_STATE_MACHINES_OUTPUT}`, import.meta.url),
    generateStateMachinesPy(machines),
  );
  uvRun('ruff', ['format', '--quiet', PY_STATE_MACHINES_OUTPUT]);
  uvRun('ruff', ['check', '--quiet', PY_STATE_MACHINES_OUTPUT]);
  console.warn(`contracts: wrote ${PY_STATE_MACHINES_OUTPUT}`);
}

await typescript();
python();
await stateMachines();
