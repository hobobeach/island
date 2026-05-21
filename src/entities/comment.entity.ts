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
import { Post } from './post.entity';

@Entity('comments')
@Index(['createdAt'])
export class Comment {
  @PrimaryGeneratedColumn()
  id!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => Post, { nullable: false, onDelete: 'CASCADE' })
  @Index()
  post!: Post;

  /** Parent comment for threaded replies; null for top-level comments on a post. */
  @ManyToOne(() => Comment, { nullable: true, onDelete: 'SET NULL' })
  parent!: Comment | null;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  author!: User;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'integer', default: 0 })
  score!: number;

  @Column({ type: 'boolean', default: false })
  isDeleted!: boolean;
}
