import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('password_reset_tokens')
@Index(['createdAt'])
@Index(['userId'])
export class PasswordResetToken {
  @PrimaryGeneratedColumn()
  id!: number;

  /** The opaque token that travels in the emailed reset link. */
  @Column({ type: 'text', unique: true })
  uuid!: string;

  /** The user this token resets the password for. */
  @Column()
  userId!: number;

  @CreateDateColumn()
  createdAt!: Date;

  /** When the token was redeemed — set once, makes it single-use. */
  @Column({ type: 'datetime', nullable: true })
  usedAt!: Date | null;
}
