import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('request_logs')
@Index(['createdAt'])
@Index(['path'])
@Index(['status'])
export class RequestLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ length: 8 })
  method!: string;

  @Column()
  path!: string;

  @Column({ type: 'text', nullable: true })
  query!: string | null;

  @Column()
  status!: number;

  @Column()
  durationMs!: number;

  @Column({ type: 'text', nullable: true })
  ip!: string | null;

  @Column({ type: 'text', nullable: true })
  userAgent!: string | null;

  @Column({ type: 'text', nullable: true })
  referer!: string | null;

  @Column({ type: 'integer', nullable: true })
  contentLength!: number | null;
}
