/** Hằng số/key builder dùng bởi ≥2 file trong module (docs/05 § 5.1). */

/** Tên constraint DB (migration soul-match) — service bắt unique violation theo đúng tên. */
export const UQ_MESSAGE_IDEMPOTENCY = 'uq_soul_chat_messages_idempotency_key';
export const UQ_RATING_SESSION_RATER = 'uq_soul_match_ratings_session_rater';

/**
 * Sanity cap CỨNG ở tầng transport/schema (DTO @Length + Joi .max) — KHÔNG phải giới hạn
 * nghiệp vụ: giới hạn thật là config SOUL_CHAT_MESSAGE_MAX_LENGTH, check trong service.
 */
export const MESSAGE_CONTENT_HARD_CAP = 2000;

/** Prefix theo domain cho idempotency key message (docs/05 § 5.10 — key client scope theo user). */
export function messageIdempotencyKey(userId: string, key: string): string {
  return `soul:msg:${userId}:${key}`;
}
