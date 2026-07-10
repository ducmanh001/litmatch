import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { SafetyReport } from './report.entity';

export enum EvidenceKind {
  MatchSession = 'match_session',
  Message = 'message',
  Profile = 'profile',
  Media = 'media',
}

export enum EvidenceContentType {
  Jpeg = 'image/jpeg',
  Png = 'image/png',
  Webp = 'image/webp',
  MpegAudio = 'audio/mpeg',
  Mp4Audio = 'audio/mp4',
  Mp4Video = 'video/mp4',
}

export enum EvidenceVerificationStatus {
  /** Client claim only. A later R-007 moderation/upload slice must verify resource existence and access. */
  Unverified = 'unverified',
}

/**
 * Structured evidence metadata only. There is intentionally no URL, text body, base64 or binary column;
 * evidence upload, access control and retention are a later R-007 slice.
 */
@Entity({ name: 'report_evidence_metadata' })
export class ReportEvidenceMetadata {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_report_evidence_report')
  @Column({ type: 'uuid' })
  reportId!: string;

  @ManyToOne(() => SafetyReport, (report) => report.evidence, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'report_id' })
  report!: SafetyReport;

  @Column({ type: 'varchar', length: 24 })
  kind!: EvidenceKind;

  /** Opaque UUID of a server-owned resource; never a client-provided URL. */
  @Column({ type: 'uuid' })
  referenceId!: string;

  @Column({ type: 'char', length: 64, nullable: true })
  sha256!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  contentType!: EvidenceContentType | null;

  @Column({ type: 'integer', nullable: true })
  byteSize!: number | null;

  /** Server-owned status; absent from CreateReportDto so clients cannot claim evidence is verified. */
  @Column({ type: 'varchar', length: 16, default: EvidenceVerificationStatus.Unverified })
  verificationStatus!: EvidenceVerificationStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
