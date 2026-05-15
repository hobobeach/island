import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type InviteRequestStatus = 'pending' | 'approved' | 'rejected';

@Entity('invite_requests')
@Index(['createdAt'])
@Index(['status'])
export class InviteRequest {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'text', unique: true })
  uuid!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @Column()
  fullName!: string;

  @Column({ unique: true })
  email!: string;

  @Column({ type: 'text', nullable: true })
  ip!: string | null;

  @Column({ type: 'text', nullable: true })
  userAgent!: string | null;

  @Column({ type: 'text', nullable: true })
  referer!: string | null;

  @Column({ type: 'text', default: 'pending' })
  status!: InviteRequestStatus;
}
