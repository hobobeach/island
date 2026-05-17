import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type InviteRequestStatus = 'pending' | 'invited' | 'approved' | 'rejected';

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

  /** Whether the account created from this invite should be an admin. Set
   *  when an admin chooses "email invite"; applied when the user signs up. */
  @Column({ type: 'boolean', default: false })
  grantAdmin!: boolean;

  /** When the signup invite email was sent (drives the link's expiry). */
  @Column({ type: 'datetime', nullable: true })
  invitedAt!: Date | null;
}
