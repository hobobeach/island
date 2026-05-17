import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('users')
@Index(['createdAt'])
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'text', unique: true })
  uuid!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @Column()
  fullName!: string;

  @Column({ unique: true })
  username!: string;

  @Column({ unique: true })
  email!: string;

  /** bcrypt hash of the account password — never store the plaintext. */
  @Column()
  passwordHash!: string;

  /** IP address the account holder used when requesting their invite. */
  @Column({ type: 'text', nullable: true })
  ip!: string | null;

  @Column({ type: 'boolean', default: false })
  isAdmin!: boolean;

  /** Whether the one-time membership fee has been paid. */
  @Column({ type: 'boolean', default: false })
  hasPaid!: boolean;

  /** When the membership fee was paid. */
  @Column({ type: 'datetime', nullable: true })
  paidAt!: Date | null;

  /** Stripe PaymentIntent id of the membership payment, for reconciliation. */
  @Column({ type: 'text', nullable: true })
  stripePaymentIntentId!: string | null;
}
