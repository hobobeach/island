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
}
