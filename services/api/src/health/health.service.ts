import { Injectable } from '@nestjs/common';

export interface HealthStatus {
  status: 'ok';
}

@Injectable()
export class HealthService {
  // Liveness only: the process is up and serving. Database and Redis checks join when their
  // modules exist.
  check(): HealthStatus {
    return { status: 'ok' };
  }
}
