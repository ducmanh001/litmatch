import type { DataSource } from 'typeorm';

type Release = () => void;

interface Admission {
  ready: Promise<Release | undefined>;
  cancel: () => void;
}

/** FIFO waiters hold no connection. ManagedInterval allows at most one waiter per registered job. */
class AdmissionLane {
  private inUse = 0;
  private readonly pending: Array<(release: Release | undefined) => void> = [];

  constructor(private readonly limit: number) {}

  acquire(): Admission {
    let waiter: ((release: Release | undefined) => void) | undefined;
    const ready = new Promise<Release | undefined>((resolve) => {
      if (this.inUse < this.limit) {
        resolve(this.permit());
      } else {
        waiter = resolve;
        this.pending.push(resolve);
      }
    });
    return {
      ready,
      cancel: () => {
        if (waiter === undefined) return;
        const index = this.pending.indexOf(waiter);
        if (index < 0) return;
        this.pending.splice(index, 1);
        waiter(undefined);
      },
    };
  }

  private permit(): Release {
    this.inUse += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.inUse -= 1;
      const next = this.pending.shift();
      if (next !== undefined) next(this.permit());
    };
  }
}

// Runtime poolSize is the validated DATABASE_POOL_MAX; lightweight test doubles omit options.
const MOCK_POOL_SIZE = 10;
const HTTP_RESERVED_CONNECTIONS = 1;
const CRITICAL_RESERVED_CONNECTIONS = 2;
const WORKER_POOL_FRACTION = 4;
const admissions = new WeakMap<
  DataSource,
  { regular: AdmissionLane; critical: AdmissionLane }
>();

/**
 * Reserve one HTTP connection and two for the sequential calling timer (claim + task).
 * Each regular slot budgets a claim plus the existing bounded workers' pool/4 parallelism.
 * Tasks must keep that bound; this admission is not a connection limiter for arbitrary task code.
 */
export function acquireBackgroundDatabaseAdmission(
  dataSource: DataSource,
  priority: 'regular' | 'critical' = 'regular',
): Admission {
  let lanes = admissions.get(dataSource);
  if (lanes === undefined) {
    const poolSize = dataSource.options?.poolSize ?? MOCK_POOL_SIZE;
    const jobCost =
      1 + Math.max(1, Math.floor(poolSize / WORKER_POOL_FRACTION));
    const regularSlots = Math.max(
      1,
      Math.floor(
        (poolSize - HTTP_RESERVED_CONNECTIONS - CRITICAL_RESERVED_CONNECTIONS) /
          jobCost,
      ),
    );
    lanes = {
      regular: new AdmissionLane(regularSlots),
      critical: new AdmissionLane(1),
    };
    admissions.set(dataSource, lanes);
  }
  return lanes[priority].acquire();
}
