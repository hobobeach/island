import {
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  Index,
} from 'typeorm';

import { User } from './user.entity';
import { Post } from './post.entity';

@Entity('post_upvotes')
@Index('IDX_post_upvote_unique', ['user', 'post'], { unique: true })
export class PostUpvote {
  @PrimaryGeneratedColumn()
  id!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  user!: User;

  @ManyToOne(() => Post, { nullable: false, onDelete: 'CASCADE' })
  post!: Post;
}
