import { Column, Entity, Index } from 'typeorm';

import { BaseAppEntity } from '../../../common/entities/base.entity';

/**
 * Lần đầu một user mở chat trực tiếp với profile. Một cặp chỉ được ghi một
 * lần; ngày này là ngày UTC để đếm người bắt chuyện mới trong ngày của profile.
 */
@Entity({ name: 'profile_chat_contacts' })
@Index('uq_profile_chat_contacts_pair', ['profileUserId', 'requesterUserId'], {
  unique: true,
})
@Index('idx_profile_chat_contacts_profile_date', [
  'profileUserId',
  'firstContactDate',
])
export class ProfileChatContact extends BaseAppEntity {
  @Column({ type: 'uuid' })
  profileUserId!: string;

  @Column({ type: 'uuid' })
  requesterUserId!: string;

  @Column({ type: 'date' })
  firstContactDate!: string;
}
