import { AppDataSource } from '../app-data-source';
import { Post } from '../entities/post.entity';
import { Comment } from '../entities/comment.entity';

/**
 * A user's karma: net upvotes received from other members on their posts and
 * comments. Each item starts at `score = 1` because its creation also writes a
 * self-upvote row; we subtract one point per item so karma reflects votes
 * received from other members. Soft-deleted items still count.
 */
export async function computeKarma(userId: number): Promise<number> {
  const postRow = await AppDataSource.getRepository(Post)
    .createQueryBuilder('post')
    .select('COALESCE(SUM(post.score), 0)', 'total')
    .addSelect('COUNT(*)', 'count')
    .where('post.author = :id', { id: userId })
    .getRawOne<{ total: string | number; count: string | number }>();

  const commentRow = await AppDataSource.getRepository(Comment)
    .createQueryBuilder('comment')
    .select('COALESCE(SUM(comment.score), 0)', 'total')
    .addSelect('COUNT(*)', 'count')
    .where('comment.author = :id', { id: userId })
    .getRawOne<{ total: string | number; count: string | number }>();

  const postKarma = Number(postRow?.total ?? 0) - Number(postRow?.count ?? 0);
  const commentKarma = Number(commentRow?.total ?? 0) - Number(commentRow?.count ?? 0);
  return postKarma + commentKarma;
}
