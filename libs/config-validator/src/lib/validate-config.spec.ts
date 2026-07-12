import * as Joi from 'joi';

import { baseEnvSchema, createConfigValidator } from './validate-config';

describe('createConfigValidator', () => {
  const validate = createConfigValidator(
    Joi.object({
      ...baseEnvSchema,
      PORT: Joi.number().port().required(),
      JWT_SECRET: Joi.string().min(32).required(),
    }),
  );

  it('pass với config hợp lệ + áp default', () => {
    const value = validate({ PORT: '3000', JWT_SECRET: 'x'.repeat(32) });
    expect(value['PORT']).toBe(3000);
    expect(value['NODE_ENV']).toBe('development');
  });

  it('gom tất cả lỗi vào 1 message, không chết ở lỗi đầu tiên', () => {
    expect(() => validate({})).toThrow(/PORT[\s\S]*JWT_SECRET/);
  });

  it('cho phép key lạ từ env của OS', () => {
    expect(() =>
      validate({
        PORT: '3000',
        JWT_SECRET: 'x'.repeat(32),
        RANDOM_OS_VAR: '1',
      }),
    ).not.toThrow();
  });
});
