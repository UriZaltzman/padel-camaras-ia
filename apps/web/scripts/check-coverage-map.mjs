// Fails when a screen of e2e/coverage-map.json has no spec (plan section 4). Run: pnpm e2e:coverage
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Returns the list of problems; empty when every mapped screen is covered. */
export function checkCoverage(
  map,
  read = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null),
  base = root,
) {
  const problems = [];
  const seen = new Set();
  for (const screen of map.screens ?? []) {
    if (seen.has(screen.id)) problems.push(`${screen.id}: listed twice`);
    seen.add(screen.id);
    if (!screen.route?.startsWith('/')) problems.push(`${screen.id}: missing route`);
    if (!screen.spec) {
      problems.push(`${screen.id}: no spec`);
      continue;
    }
    const source = read(join(base, screen.spec));
    if (source === null) problems.push(`${screen.id}: spec ${screen.spec} does not exist`);
    else {
      if (!source.includes(`screenTitle('${screen.id}'`)) {
        problems.push(
          `${screen.id}: ${screen.spec} has no test named with screenTitle('${screen.id}', ...)`,
        );
      }
      if (!source.includes('expectResponsive(')) {
        problems.push(`${screen.id}: ${screen.spec} never calls expectResponsive`);
      }
    }
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const map = JSON.parse(readFileSync(join(root, 'e2e/coverage-map.json'), 'utf8'));
  const problems = checkCoverage(map);
  if (problems.length > 0) {
    process.stderr.write(
      `Coverage map has ${problems.length} problem(s):\n- ${problems.join('\n- ')}\n`,
    );
    process.exit(1);
  }
  process.stdout.write(`Coverage map OK: ${map.screens.length} screens, all with a spec.\n`);
}
