import 'reflect-metadata';
import { bootstrap } from './bootstrap';
import { EnvValidationError } from './config/env';

bootstrap().catch((error: unknown) => {
  // The logger may not exist yet (invalid environment), so write one JSON line to stderr.
  // EnvValidationError lists variable names only, never their values.
  const line =
    error instanceof EnvValidationError
      ? { level: 'fatal', msg: error.message, problems: error.problems }
      : { level: 'fatal', msg: 'API failed to start', error: String(error) };
  console.error(JSON.stringify(line));
  process.exit(1);
});
