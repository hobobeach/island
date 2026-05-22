import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  Index,
} from 'typeorm';

import { User } from './user.entity';

@Entity('banned_ips')
@Index(['ip'], { unique: true })
export class BannedIp {
  @PrimaryGeneratedColumn()
  id!: number;

  @CreateDateColumn()
  createdAt!: Date;

  /** Already-normalized IP (no leading `::ffff:`), matching what we log. */
  @Column()
  ip!: string;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  /** Admin who created the ban. Nullable so deleting the admin keeps the ban. */
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  bannedBy!: User | null;
}
