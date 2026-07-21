import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Một lượt yêu thích immutable sau Voice Match; unique DB là chốt chống double tap/retry. */
@Entity({ name: 'voice_match_reactions' })
@Index('uq_voice_match_reactions_call_rater', ['callId', 'raterUserId'], {
  unique: true,
})
export class VoiceMatchReaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  callId!: string;

  @Column({ type: 'uuid' })
  raterUserId!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
