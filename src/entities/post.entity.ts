import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  Index,
} from 'typeorm';

import { User } from './user.entity';

@Entity('posts')
@Index(['createdAt'])
export class Post {
  @PrimaryGeneratedColumn()
  id!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  author!: User;

  @Column({ type: 'text' })
  title!: string;

  /** Link submission URL. Exclusively one of `url` or `body` is set. */
  @Column({ type: 'text', nullable: true })
  url!: string | null;

  /** Text/Ask post body (plain text). Exclusively one of `url` or `body` is set. */
  @Column({ type: 'text', nullable: true })
  body!: string | null;

  /** Denormalized upvote count, kept in sync with PostUpvote rows. */
  @Column({ type: 'integer', default: 0 })
  score!: number;

  /** Denormalized comment count (includes soft-deleted; never decremented). */
  @Column({ type: 'integer', default: 0 })
  commentCount!: number;

  @Column({ type: 'boolean', default: false })
  isDeleted!: boolean;
}
