import {
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  Index,
} from 'typeorm';

import { User } from './user.entity';
import { Comment } from './comment.entity';

@Entity('comment_upvotes')
@Index('IDX_comment_upvote_unique', ['user', 'comment'], { unique: true })
export class CommentUpvote {
  @PrimaryGeneratedColumn()
  id!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  user!: User;

  @ManyToOne(() => Comment, { nullable: false, onDelete: 'CASCADE' })
  comment!: Comment;
}
