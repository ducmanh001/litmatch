import { DataSource } from 'typeorm';
import { postgresRuntimeOptions } from './postgres-runtime-options';

const databaseUrl = process.env['INTEGRATION_DB_URL'];
const describeDatabase = databaseUrl ? describe : describe.skip;
jest.setTimeout(15_000);

describeDatabase('Postgres runtime resource deadlines (real Postgres)', () => {
  let ds: DataSource;
  beforeAll(async () => {
    if (!databaseUrl) throw new Error('INTEGRATION_DB_URL is required');
    const url = new URL(databaseUrl);
    url.pathname = '/postgres';
    const limits: Record<string, number> = {
      DATABASE_POOL_MAX: 1,
      DATABASE_POOL_ACQUIRE_TIMEOUT_MS: 1000,
      DATABASE_STATEMENT_TIMEOUT_MS: 100,
    };
    ds = new DataSource({
      type: 'postgres',
      url: url.toString(),
      ...postgresRuntimeOptions({
        getOrThrow: (key: string) => limits[key],
      } as never),
    });
    await ds.initialize();
  });
  afterAll(async () => {
    await ds?.destroy();
  });

  it('server cancels an overlong query and the same pool remains usable', async () => {
    await expect(ds.query('SELECT pg_sleep(2)')).rejects.toMatchObject({
      driverError: { code: '57014' },
    });
    await expect(ds.query('SELECT 1 AS value')).resolves.toEqual([
      { value: 1 },
    ]);
  });

  it('a request waiting behind an occupied pool fails within the acquire deadline', async () => {
    const holder = ds.createQueryRunner();
    await holder.connect();
    try {
      await expect(ds.query('SELECT 1')).rejects.toThrow(/timeout|exceeded/iu);
    } finally {
      await holder.release();
    }
    await expect(ds.query('SELECT 1 AS value')).resolves.toEqual([
      { value: 1 },
    ]);
  });

  it('statement cancellation in a transaction rolls its earlier writes back', async () => {
    await ds.query('CREATE TEMP TABLE deadline_probe (id int)');
    await expect(
      ds.transaction(async (manager) => {
        await manager.query('INSERT INTO deadline_probe VALUES (1)');
        await manager.query('SELECT pg_sleep(2)');
      }),
    ).rejects.toMatchObject({ driverError: { code: '57014' } });
    await expect(
      ds.query('SELECT count(*)::int AS n FROM deadline_probe'),
    ).resolves.toEqual([{ n: 0 }]);
  });
});
