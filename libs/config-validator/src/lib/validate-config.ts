import * as Joi from 'joi';

/**
 * Validate `.env` bằng Joi (docs/05 § 5.1) — fail-fast lúc bootstrap,
 * gom toàn bộ lỗi thành 1 message thay vì chết ở key đầu tiên.
 * Dùng làm `validate` option của `ConfigModule.forRoot`.
 */
export function createConfigValidator(schema: Joi.ObjectSchema) {
  return (config: Record<string, unknown>): Record<string, unknown> => {
    const { error, value } = schema.validate(config, {
      allowUnknown: true, // env của OS chứa nhiều key ngoài app
      abortEarly: false,
      convert: true,
    });
    if (error) {
      const details = error.details.map((d) => `- ${d.message}`).join('\n');
      throw new Error(`Cấu hình môi trường không hợp lệ:\n${details}`);
    }
    return value;
  };
}

/** Fragment schema chung cho mọi app. */
export const baseEnvSchema = {
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  LOG_LEVEL: Joi.string()
    .valid('trace', 'debug', 'info', 'warn', 'error')
    .default('info'),
};
