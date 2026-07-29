import { HttpStatus } from '@nestjs/common';

import { EconomyController } from './economy.controller';
import { EconomyErrors } from './economy.errors';

describe('EconomyController payOS boundary', () => {
  it('chặn guest 403 trước khi tạo order payOS', async () => {
    const createOrder = jest.fn();
    const controller = new EconomyController(
      {} as never,
      {
        createOrder,
      } as never,
    );

    await expect(
      controller.createPayosOrder(
        {
          userId: 'ef45dc1e-a22f-4bcf-b97e-b3377c1ba61f',
          isGuest: true,
          role: 'user',
        },
        { packageId: 'vn-50000' },
        'guest-attempt',
      ),
    ).rejects.toMatchObject({
      code: EconomyErrors.PAYOS_GUEST_FORBIDDEN,
      httpStatus: HttpStatus.FORBIDDEN,
    });
    expect(createOrder).not.toHaveBeenCalled();
  });
});
