import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve(__dirname, '..');

function source(...parts: string[]): string {
  return readFileSync(resolve(SRC, ...parts), 'utf8');
}

describe('PostgreSQL persistence boundaries (ADR 0012)', () => {
  it('Auth token lifecycle depends on a port, not TypeORM', () => {
    expect(
      source('modules', 'auth', 'services', 'token.service.ts'),
    ).not.toMatch(/typeorm/u);
    expect(
      source('modules', 'auth', 'ports', 'refresh-session.port.ts'),
    ).not.toMatch(/refresh-token\.entity/u);
    expect(source('modules', 'auth', 'auth.module.ts')).toContain(
      'RefreshSessionPort',
    );
  });

  it('Economy callers depend on the aggregate persistence port, not the writer implementation', () => {
    for (const path of [
      ['modules', 'economy', 'economy.service.ts'],
      ['modules', 'economy', 'services', 'refund.service.ts'],
      ['modules', 'economy', 'services', 'payos.service.ts'],
    ]) {
      const text = source(...path);
      expect(text).toContain('LedgerPersistencePort');
      expect(text).not.toContain('./services/ledger.service');
      expect(text).not.toContain('./ledger.service');
    }

    expect(source('modules', 'economy', 'economy.module.ts')).toContain(
      'useExisting: LedgerService',
    );
    expect(source('modules', 'economy', 'index.ts')).not.toMatch(
      /export[^\n]*LedgerService/u,
    );
  });

  it('does not erase transaction protocols behind a generic repository', () => {
    const ledger = source(
      'modules',
      'economy',
      'services',
      'ledger.service.ts',
    );
    const matching = source(
      'modules',
      'matching',
      'jobs',
      'matcher-worker.service.ts',
    );

    expect(ledger).toMatch(/pessimistic_write/u);
    expect(ledger).toMatch(/ON CONFLICT DO NOTHING/u);
    expect(matching).toMatch(/pessimistic_write/u);
    expect(matching).toMatch(/dataSource\.transaction/u);
  });

  it('keeps migration-first and the database-owned invariants', () => {
    expect(source('database', 'data-source.ts')).toMatch(
      /synchronize:\s*false/u,
    );

    const auth = source(
      'database',
      'migrations',
      '1751900000000-init-auth-user.ts',
    );
    expect(auth).toContain('uq_auth_identities_provider_uid');
    expect(auth).toContain('uq_refresh_tokens_token_hash');

    const economy = source(
      'database',
      'migrations',
      '1752000000000-economy-ledger.ts',
    );
    expect(economy).toContain('uq_transactions_idempotency_key');
    expect(economy).toContain('trg_ledger_entries_append_only');
    expect(economy).toContain('CHECK (amount > 0)');
    expect(economy).not.toContain('CHECK (balance >= 0)');

    const matching = source(
      'database',
      'migrations',
      '1752200000000-matching-core.ts',
    );
    expect(matching).toContain('uq_match_tickets_active_user');
    expect(matching).toContain('uq_match_tickets_idempotency_key');
    expect(matching).toContain('chk_match_sessions_distinct_users');
  });
});
