import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { ReportEvidenceMetadata } from './report-evidence-metadata.entity';

export enum ReportCategory {
  Harassment = 'harassment',
  HateOrAbuse = 'hate_or_abuse',
  SexualContent = 'sexual_content',
  SpamOrScam = 'spam_or_scam',
  ThreatOrViolence = 'threat_or_violence',
  SuspectedMinor = 'suspected_minor',
  Other = 'other',
}

export enum ReportPriority {
  Standard = 'standard',
  Urgent = 'urgent',
}

export enum ReportStatus {
  Submitted = 'submitted',
}

/** User-submitted safety report. Moderation transitions are deliberately outside this foundation slice. */
@Entity({ name: 'safety_reports' })
export class SafetyReport {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_safety_reports_reporter_created')
  @Column({ type: 'uuid' })
  reporterUserId!: string;

  @Index('idx_safety_reports_reported_created')
  @Column({ type: 'uuid' })
  reportedUserId!: string;

  @Column({ type: 'varchar', length: 32 })
  category!: ReportCategory;

  /** Derived by the server from category; clients cannot choose moderation priority. */
  @Column({ type: 'varchar', length: 16 })
  priority!: ReportPriority;

  @Column({ type: 'varchar', length: 16, default: ReportStatus.Submitted })
  status!: ReportStatus;

  @Column({ type: 'varchar', length: 500, nullable: true })
  summary!: string | null;

  @OneToMany(() => ReportEvidenceMetadata, (evidence) => evidence.report)
  evidence!: ReportEvidenceMetadata[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
