import { JwtService } from '@nestjs/jwt';
import axios from 'axios';
import { Pool } from 'pg';

const E2E_USER_ID = '00000000-0000-4000-8000-0000000000e2';
const E2E_IAP_TRANSACTION_ID = 'core-e2e-economy-iap-v1';
const E2E_VIP_IDEMPOTENCY_KEY = 'core-e2e-economy-vip-v1';

interface IapResult {
  transactionId: string;
  diamonds: string;
  replayed: boolean;
}

interface VipResult {
  transactionId: string;
  tier: string;
  vipExpiresAt: string;
  replayed: boolean;
}

interface WalletResult {
  balance: string;
  earnings: string;
  vipTier: string | null;
  vipExpiresAt: string | null;
}

describe('Economy HTTP flow', () => {
  const databaseUrl = process.env.DATABASE_URL;
  const jwtSecret = process.env.JWT_SECRET;
  let pool: Pool;
  let authorization: string;

  beforeAll(async () => {
    if (!databaseUrl || !jwtSecret) {
      throw new Error('Economy E2E cần DATABASE_URL và JWT_SECRET');
    }
    pool = new Pool({ connectionString: databaseUrl });
    await pool.query(
      `INSERT INTO users (id, nickname, avatar_id, is_guest)
       VALUES ($1, 'Core E2E Economy', 'default-avatar', false)
       ON CONFLICT (id) DO UPDATE SET is_guest = false, status = 'active'`,
      [E2E_USER_ID],
    );
    const accessToken = new JwtService({ secret: jwtSecret }).sign({
      sub: E2E_USER_ID,
      isGuest: false,
    });
    authorization = `Bearer ${accessToken}`;
  });

  afterAll(async () => {
    await pool.end();
  });

  it('credit IAP và mua VIP idempotent qua HTTP, ledger vẫn cân', async () => {
    const iapRequest = {
      provider: 'google',
      productId: 'com.litmatch.diamond.550',
      payload: { devTransactionId: E2E_IAP_TRANSACTION_ID },
    };
    const firstCredit = await axios.post<{ data: IapResult }>(
      '/api/v1/economy/iap/verify',
      iapRequest,
      { headers: { authorization } },
    );
    const replayCredit = await axios.post<{ data: IapResult }>(
      '/api/v1/economy/iap/verify',
      iapRequest,
      { headers: { authorization } },
    );

    expect(replayCredit.data.data).toMatchObject({
      transactionId: firstCredit.data.data.transactionId,
      diamonds: '550',
      replayed: true,
    });

    const vipHeaders = {
      authorization,
      'Idempotency-Key': E2E_VIP_IDEMPOTENCY_KEY,
    };
    const firstVip = await axios.post<{ data: VipResult }>(
      '/api/v1/economy/vip/purchase',
      { planId: 'vip-30d' },
      { headers: vipHeaders },
    );
    const replayVip = await axios.post<{ data: VipResult }>(
      '/api/v1/economy/vip/purchase',
      { planId: 'vip-30d' },
      { headers: vipHeaders },
    );

    expect(replayVip.data.data).toMatchObject({
      transactionId: firstVip.data.data.transactionId,
      tier: 'vip',
      replayed: true,
    });

    const wallet = await axios.get<{ data: WalletResult }>(
      '/api/v1/economy/wallet',
      { headers: { authorization } },
    );
    expect(wallet.data.data).toMatchObject({
      balance: '50',
      earnings: '0',
      vipTier: 'vip',
    });

    const balanced = await pool.query<{ debit: string; credit: string }>(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE direction = 'debit'), 0)::text AS debit,
         COALESCE(SUM(amount) FILTER (WHERE direction = 'credit'), 0)::text AS credit
       FROM ledger_entries
       WHERE transaction_id = ANY($1::uuid[])`,
      [[firstCredit.data.data.transactionId, firstVip.data.data.transactionId]],
    );
    expect(balanced.rows[0]).toEqual({ debit: '1050', credit: '1050' });
  });
});
