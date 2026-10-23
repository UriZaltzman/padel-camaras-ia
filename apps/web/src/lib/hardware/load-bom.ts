import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { parseBom, type Bom } from './bom';

/** `infra/hardware/bom.yaml` of the monorepo (the web app runs from `apps/web`). */
export const BOM_PATH = path.resolve(process.cwd(), '../../infra/hardware/bom.yaml');

export async function loadBom(file: string = BOM_PATH): Promise<Bom> {
  return parseBom(await readFile(file, 'utf8'));
}
