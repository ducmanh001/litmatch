export interface ConnectionAdmission {
  readonly active: boolean;
  releaseConnection(): void;
  finishHandshake(): void;
}

/** No queue: reserve before asynchronous JWT/Redis work, then fail fast when full. */
export class ConnectionAdmissionBudget {
  private readonly reservations = new Set<ConnectionAdmission>();
  private readonly handshakes = new Set<ConnectionAdmission>();
  private closed = false;

  constructor(
    private readonly maxConnections: number,
    private readonly maxHandshakes: number,
  ) {}

  get connections(): number {
    return this.reservations.size;
  }

  get pendingHandshakes(): number {
    return this.handshakes.size;
  }

  reserve(): ConnectionAdmission | undefined {
    if (
      this.closed ||
      this.connections >= this.maxConnections ||
      this.pendingHandshakes >= this.maxHandshakes
    ) {
      return undefined;
    }

    const reservations = this.reservations;
    const handshakes = this.handshakes;
    const admission: ConnectionAdmission = {
      get active() {
        return reservations.has(admission);
      },
      releaseConnection() {
        reservations.delete(admission);
      },
      finishHandshake() {
        handshakes.delete(admission);
      },
    };
    reservations.add(admission);
    handshakes.add(admission);
    return admission;
  }

  close(): void {
    this.closed = true;
    this.reservations.clear();
    this.handshakes.clear();
  }
}
