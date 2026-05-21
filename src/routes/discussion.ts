import express, { NextFunction, Request, Response } from 'express';
import { In } from 'typeorm';

import { config } from '../shared/config';
import { requireMember } from '../middlewares/auth';
import { AppDataSource } from '../app-data-source';
import { Post } from '../entities/post.entity';
import { Comment } from '../entities/comment.entity';
import { PostUpvote } from '../entities/post-upvote.entity';
import { CommentUpvote } from '../entities/comment-upvote.entity';
import { User } from '../entities/user.entity';
import { formatRelative } from '../shared/format-time';
import { formatBody, extractDomain } from '../shared/format-text';

export const discussionRouter = express.Router();
discussionRouter.use(requireMember);

const PAGE_SIZE = 30;
const EDIT_WINDOW_MS = 2 * 60 * 60 * 1000;
const MAX_TITLE_LEN = 300;
const MAX_BODY_LEN = 8000;
const MAX_URL_LEN = 2000;
const URL_RE = /^https?:\/\/\S+$/i;

type Flash = 'ok' | 'error';

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Read `request.user` as the User row attached by `requireMember`. */
function currentUser(request: Request): User {
  return request.user as User;
}

/** Send a redirect with a one-off flash message. */
function flash(response: Response, target: string, key: Flash, message: string): void {
  const sep = target.includes('?') ? '&' : '?';
  response.redirect(`${target}${sep}${key}=${encodeURIComponent(message)}`);
}

/** Restrict redirects to in-app paths to avoid open-redirect bugs. */
function safeBack(input: string, fallback: string): string {
  const value = asString(input);
  return value.startsWith('/discussion') ? value : fallback;
}

function withinEditWindow(createdAt: Date): boolean {
  return Date.now() - createdAt.getTime() <= EDIT_WINDOW_MS;
}

/** Build a post-list view-model row (rank is 1-based on the page). */
function shapePostRow(
  post: Post,
  rank: number,
  userId: number,
  upvotedIds: Set<number>,
): Record<string, unknown> {
  const isText = !post.url;
  const itemUrl = `/discussion/item/${post.id}`;
  return {
    id: post.id,
    rank,
    title: post.isDeleted ? '[deleted]' : post.title,
    url: post.url,
    domain: post.url ? extractDomain(post.url) : null,
    isText,
    itemUrl,
    href: post.isDeleted ? itemUrl : (post.url || itemUrl),
    score: post.score,
    authorUsername: post.author?.username ?? '[deleted]',
    ageRelative: formatRelative(post.createdAt),
    commentCount: post.commentCount,
    hasUpvoted: upvotedIds.has(post.id),
    isAuthor: post.author?.id === userId,
    isDeleted: post.isDeleted,
  };
}

async function loadUserUpvotedPostIds(userId: number, postIds: number[]): Promise<Set<number>> {
  if (postIds.length === 0) return new Set();
  const rows = await AppDataSource.getRepository(PostUpvote)
    .createQueryBuilder('uv')
    .select('uv.postId', 'postId')
    .where('uv.userId = :userId', { userId })
    .andWhere('uv.postId IN (:...postIds)', { postIds })
    .getRawMany<{ postId: number }>();
  return new Set(rows.map((row) => Number(row.postId)));
}

async function loadUserUpvotedCommentIds(userId: number, commentIds: number[]): Promise<Set<number>> {
  if (commentIds.length === 0) return new Set();
  const rows = await AppDataSource.getRepository(CommentUpvote)
    .createQueryBuilder('uv')
    .select('uv.commentId', 'commentId')
    .where('uv.userId = :userId', { userId })
    .andWhere('uv.commentId IN (:...commentIds)', { commentIds })
    .getRawMany<{ commentId: number }>();
  return new Set(rows.map((row) => Number(row.commentId)));
}

function parsePage(raw: unknown): number {
  const n = Number(asString(raw));
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/** GET /discussion — HN-ranked top page. */
discussionRouter.get('/', async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = currentUser(request);
    const page = parsePage(request.query.page);
    const offset = (page - 1) * PAGE_SIZE;

    // TypeORM 0.3.x triggers a pagination subquery whenever a join is combined
    // with skip/take/offset/limit, and that subquery parses each orderBy key by
    // splitting on the first "." — which mangles raw SQL expressions like the
    // HN-rank formula below. We side-step it by paginating without the join,
    // then loading the authors separately and reattaching them in rank order.
    const rankedRows = await AppDataSource.getRepository(Post)
      .createQueryBuilder('post')
      .select('post.id', 'id')
      .where('post.isDeleted = :deleted', { deleted: false })
      .orderBy(
        "(CAST(post.score AS REAL) - 1.0) / "
        + "pow(((julianday('now') - julianday(post.createdAt)) * 24.0 + 2.0), 1.8)",
        'DESC',
      )
      .offset(offset)
      .limit(PAGE_SIZE + 1)
      .getRawMany<{ id: number }>();
    const orderedIds = rankedRows.map((row) => Number(row.id));
    const loaded = orderedIds.length === 0
      ? []
      : await AppDataSource.getRepository(Post).find({
          where: { id: In(orderedIds) },
          relations: ['author'],
        });
    const byId = new Map(loaded.map((p) => [p.id, p]));
    const posts = orderedIds
      .map((id) => byId.get(id))
      .filter((p): p is Post => p !== undefined);

    const hasMore = posts.length > PAGE_SIZE;
    const pagePosts = hasMore ? posts.slice(0, PAGE_SIZE) : posts;
    const upvotedIds = await loadUserUpvotedPostIds(user.id, pagePosts.map((p) => p.id));
    const items = pagePosts.map((p, i) => shapePostRow(p, offset + i + 1, user.id, upvotedIds));

    response.render('discussion-list', {
      ...config,
      layout: 'member',
      title: `Discussion · ${config.name}`,
      year: new Date().getFullYear(),
      navDiscussion: true,
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      isAdmin: user.isAdmin,
      sort: 'top',
      isTop: true,
      isNew: false,
      items,
      page,
      hasMore,
      nextPage: page + 1,
      notice: asString(request.query.ok) || undefined,
      error: asString(request.query.error) || undefined,
    });
  } catch (error) {
    next(error);
  }
});

/** GET /discussion/new — chronological. */
discussionRouter.get('/new', async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = currentUser(request);
    const page = parsePage(request.query.page);
    const offset = (page - 1) * PAGE_SIZE;

    const posts = await AppDataSource.getRepository(Post).find({
      where: { isDeleted: false },
      relations: ['author'],
      order: { createdAt: 'DESC' },
      skip: offset,
      take: PAGE_SIZE + 1,
    });

    const hasMore = posts.length > PAGE_SIZE;
    const pagePosts = hasMore ? posts.slice(0, PAGE_SIZE) : posts;
    const upvotedIds = await loadUserUpvotedPostIds(user.id, pagePosts.map((p) => p.id));
    const items = pagePosts.map((p, i) => shapePostRow(p, offset + i + 1, user.id, upvotedIds));

    response.render('discussion-list', {
      ...config,
      layout: 'member',
      title: `New · Discussion · ${config.name}`,
      year: new Date().getFullYear(),
      navDiscussion: true,
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      isAdmin: user.isAdmin,
      sort: 'new',
      isTop: false,
      isNew: true,
      items,
      page,
      hasMore,
      nextPage: page + 1,
      notice: asString(request.query.ok) || undefined,
      error: asString(request.query.error) || undefined,
    });
  } catch (error) {
    next(error);
  }
});

/** GET /discussion/submit — submission form. */
discussionRouter.get('/submit', (request: Request, response: Response): void => {
  const user = currentUser(request);
  response.render('discussion-submit', {
    ...config,
    layout: 'member',
    title: `Submit · Discussion · ${config.name}`,
    year: new Date().getFullYear(),
    navDiscussion: true,
    fullName: user.fullName,
    username: user.username,
    email: user.email,
    isAdmin: user.isAdmin,
    error: asString(request.query.error) || undefined,
    formTitle: asString(request.query.title),
    formUrl: asString(request.query.url),
    formBody: asString(request.query.body),
  });
});

/** POST /discussion/submit — create a post and the author's self-upvote. */
discussionRouter.post('/submit', async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = currentUser(request);
    const title = asString(request.body?.title).trim();
    const url = asString(request.body?.url).trim();
    const body = asString(request.body?.body).trim();

    const echo = `&title=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}&body=${encodeURIComponent(body)}`;
    const back = (message: string): void => {
      response.redirect(`/discussion/submit?error=${encodeURIComponent(message)}${echo}`);
    };

    if (!title) return back('Title is required.');
    if (title.length > MAX_TITLE_LEN) return back(`Title must be ${MAX_TITLE_LEN} characters or fewer.`);
    if (url && body) return back('Provide a URL or text, not both.');
    if (!url && !body) return back('Either a URL or text is required.');
    if (url) {
      if (url.length > MAX_URL_LEN) return back(`URL must be ${MAX_URL_LEN} characters or fewer.`);
      if (!URL_RE.test(url)) return back('URL must start with http:// or https://.');
    }
    if (body && body.length > MAX_BODY_LEN) return back(`Text must be ${MAX_BODY_LEN} characters or fewer.`);

    const created = await AppDataSource.transaction(async (manager) => {
      const post = manager.create(Post, {
        author: user,
        title,
        url: url || null,
        body: body || null,
        score: 1,
        commentCount: 0,
        isDeleted: false,
      });
      const saved = await manager.save(post);
      await manager.save(manager.create(PostUpvote, { user, post: saved }));
      return saved;
    });

    response.redirect(`/discussion/item/${created.id}`);
  } catch (error) {
    next(error);
  }
});

/** GET /discussion/item/:id — post detail + comment tree. */
discussionRouter.get('/item/:id', async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = currentUser(request);
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) {
      response.status(404);
      response.render('error-404', { ...config, title: 'Not found', status: 404, message: 'Not found' });
      return;
    }

    const post = await AppDataSource.getRepository(Post).findOne({
      where: { id },
      relations: ['author'],
    });
    if (!post) {
      response.status(404);
      response.render('error-404', { ...config, title: 'Not found', status: 404, message: 'Not found' });
      return;
    }

    const allComments = await AppDataSource.getRepository(Comment).find({
      where: { post: { id: post.id } },
      relations: ['author', 'parent'],
      order: { createdAt: 'ASC' },
    });

    // Build the tree, depth-first, sorted by score then time among siblings.
    const byParent = new Map<number | null, Comment[]>();
    for (const c of allComments) {
      const key = c.parent ? c.parent.id : null;
      const list = byParent.get(key) ?? [];
      list.push(c);
      byParent.set(key, list);
    }
    for (const list of byParent.values()) {
      list.sort((a, b) => (b.score - a.score) || (a.createdAt.getTime() - b.createdAt.getTime()));
    }

    const flat: Array<{ comment: Comment; depth: number }> = [];
    const walk = (parentId: number | null, depth: number): void => {
      for (const child of byParent.get(parentId) ?? []) {
        flat.push({ comment: child, depth });
        walk(child.id, depth + 1);
      }
    };
    walk(null, 0);

    const postUpvoted = await loadUserUpvotedPostIds(user.id, [post.id]);
    const commentUpvoted = await loadUserUpvotedCommentIds(
      user.id,
      flat.map((entry) => entry.comment.id),
    );

    const postView = {
      id: post.id,
      title: post.isDeleted ? '[deleted]' : post.title,
      url: post.url,
      domain: post.url ? extractDomain(post.url) : null,
      isText: !post.url,
      bodyHtml: post.isDeleted ? null : (post.body ? formatBody(post.body) : null),
      score: post.score,
      authorUsername: post.author?.username ?? '[deleted]',
      ageRelative: formatRelative(post.createdAt),
      commentCount: post.commentCount,
      hasUpvoted: postUpvoted.has(post.id),
      isAuthor: post.author?.id === user.id,
      canEdit: post.author?.id === user.id && !post.isDeleted && withinEditWindow(post.createdAt),
      isDeleted: post.isDeleted,
    };

    const comments = flat.map(({ comment, depth }) => ({
      id: comment.id,
      authorUsername: comment.author?.username ?? '[deleted]',
      bodyHtml: comment.isDeleted ? '<p class="text-body-tertiary mb-0">[deleted]</p>' : formatBody(comment.body),
      ageRelative: formatRelative(comment.createdAt),
      score: comment.score,
      depth,
      indentPx: depth * 24,
      hasUpvoted: commentUpvoted.has(comment.id),
      isAuthor: comment.author?.id === user.id,
      canEdit: comment.author?.id === user.id && !comment.isDeleted && withinEditWindow(comment.createdAt),
      isDeleted: comment.isDeleted,
    }));

    response.render('discussion-item', {
      ...config,
      layout: 'member',
      title: `${post.isDeleted ? '[deleted]' : post.title} · Discussion · ${config.name}`,
      year: new Date().getFullYear(),
      navDiscussion: true,
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      isAdmin: user.isAdmin,
      post: postView,
      comments,
      notice: asString(request.query.ok) || undefined,
      error: asString(request.query.error) || undefined,
    });
  } catch (error) {
    next(error);
  }
});

/** POST /discussion/item/:id/comment — top-level or threaded reply. */
discussionRouter.post('/item/:id/comment', async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = currentUser(request);
    const postId = Number(request.params.id);
    if (!Number.isInteger(postId)) return flash(response, '/discussion', 'error', 'Invalid post.');

    const body = asString(request.body?.body).trim();
    const parentId = Number(asString(request.body?.parentId));
    const target = `/discussion/item/${postId}`;

    if (!body) return flash(response, target, 'error', 'Comment cannot be empty.');
    if (body.length > MAX_BODY_LEN) return flash(response, target, 'error', `Comment must be ${MAX_BODY_LEN} characters or fewer.`);

    const post = await AppDataSource.getRepository(Post).findOne({ where: { id: postId } });
    if (!post) return flash(response, '/discussion', 'error', 'Post not found.');
    if (post.isDeleted) return flash(response, target, 'error', 'This post is deleted.');

    let parent: Comment | null = null;
    if (Number.isInteger(parentId) && parentId > 0) {
      parent = await AppDataSource.getRepository(Comment).findOne({
        where: { id: parentId },
        relations: ['post'],
      });
      if (!parent || parent.post.id !== post.id) {
        return flash(response, target, 'error', 'Parent comment not found.');
      }
    }

    await AppDataSource.transaction(async (manager) => {
      const comment = manager.create(Comment, {
        post,
        parent,
        author: user,
        body,
        score: 1,
        isDeleted: false,
      });
      const saved = await manager.save(comment);
      await manager.save(manager.create(CommentUpvote, { user, comment: saved }));
      await manager.increment(Post, { id: post.id }, 'commentCount', 1);
    });

    flash(response, target, 'ok', 'Comment posted.');
  } catch (error) {
    next(error);
  }
});

/** POST /discussion/item/:id/upvote — toggle the current user's upvote. */
discussionRouter.post('/item/:id/upvote', async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = currentUser(request);
    const postId = Number(request.params.id);
    const back = safeBack(asString(request.body?.back), '/discussion');
    if (!Number.isInteger(postId)) return flash(response, back, 'error', 'Invalid post.');

    const post = await AppDataSource.getRepository(Post).findOne({
      where: { id: postId },
      relations: ['author'],
    });
    if (!post) return flash(response, back, 'error', 'Post not found.');
    if (post.isDeleted) return flash(response, back, 'error', 'This post is deleted.');
    if (post.author?.id === user.id) {
      return flash(response, back, 'error', 'You can’t upvote your own post.');
    }

    await AppDataSource.transaction(async (manager) => {
      const existing = await manager.getRepository(PostUpvote).findOne({
        where: { user: { id: user.id }, post: { id: post.id } },
      });
      if (existing) {
        await manager.remove(existing);
        await manager.decrement(Post, { id: post.id }, 'score', 1);
      } else {
        await manager.save(manager.create(PostUpvote, { user, post }));
        await manager.increment(Post, { id: post.id }, 'score', 1);
      }
    });

    response.redirect(back);
  } catch (error) {
    next(error);
  }
});

/** POST /discussion/comment/:id/upvote — toggle the current user's upvote. */
discussionRouter.post('/comment/:id/upvote', async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = currentUser(request);
    const commentId = Number(request.params.id);
    const back = safeBack(asString(request.body?.back), '/discussion');
    if (!Number.isInteger(commentId)) return flash(response, back, 'error', 'Invalid comment.');

    const comment = await AppDataSource.getRepository(Comment).findOne({
      where: { id: commentId },
      relations: ['author'],
    });
    if (!comment) return flash(response, back, 'error', 'Comment not found.');
    if (comment.isDeleted) return flash(response, back, 'error', 'This comment is deleted.');
    if (comment.author?.id === user.id) {
      return flash(response, back, 'error', 'You can’t upvote your own comment.');
    }

    await AppDataSource.transaction(async (manager) => {
      const existing = await manager.getRepository(CommentUpvote).findOne({
        where: { user: { id: user.id }, comment: { id: comment.id } },
      });
      if (existing) {
        await manager.remove(existing);
        await manager.decrement(Comment, { id: comment.id }, 'score', 1);
      } else {
        await manager.save(manager.create(CommentUpvote, { user, comment }));
        await manager.increment(Comment, { id: comment.id }, 'score', 1);
      }
    });

    response.redirect(back);
  } catch (error) {
    next(error);
  }
});

/** GET /discussion/item/:id/edit — author-only, within edit window. */
discussionRouter.get('/item/:id/edit', async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = currentUser(request);
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return flash(response, '/discussion', 'error', 'Invalid post.');

    const post = await AppDataSource.getRepository(Post).findOne({
      where: { id },
      relations: ['author'],
    });
    if (!post) return flash(response, '/discussion', 'error', 'Post not found.');
    if (post.isDeleted) return flash(response, `/discussion/item/${id}`, 'error', 'Post is deleted.');
    if (post.author?.id !== user.id) return flash(response, `/discussion/item/${id}`, 'error', 'Not your post.');
    if (!withinEditWindow(post.createdAt)) {
      return flash(response, `/discussion/item/${id}`, 'error', 'Edit window has expired.');
    }

    response.render('discussion-edit-post', {
      ...config,
      layout: 'member',
      title: `Edit · Discussion · ${config.name}`,
      year: new Date().getFullYear(),
      navDiscussion: true,
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      isAdmin: user.isAdmin,
      postId: post.id,
      formTitle: post.title,
      formUrl: post.url ?? '',
      formBody: post.body ?? '',
      error: asString(request.query.error) || undefined,
    });
  } catch (error) {
    next(error);
  }
});

/** POST /discussion/item/:id/edit — save edits to title + url/body. */
discussionRouter.post('/item/:id/edit', async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = currentUser(request);
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return flash(response, '/discussion', 'error', 'Invalid post.');

    const post = await AppDataSource.getRepository(Post).findOne({
      where: { id },
      relations: ['author'],
    });
    if (!post) return flash(response, '/discussion', 'error', 'Post not found.');
    if (post.isDeleted) return flash(response, `/discussion/item/${id}`, 'error', 'Post is deleted.');
    if (post.author?.id !== user.id) return flash(response, `/discussion/item/${id}`, 'error', 'Not your post.');
    if (!withinEditWindow(post.createdAt)) {
      return flash(response, `/discussion/item/${id}`, 'error', 'Edit window has expired.');
    }

    const title = asString(request.body?.title).trim();
    const url = asString(request.body?.url).trim();
    const body = asString(request.body?.body).trim();

    const editUrl = `/discussion/item/${id}/edit`;
    if (!title) return flash(response, editUrl, 'error', 'Title is required.');
    if (title.length > MAX_TITLE_LEN) return flash(response, editUrl, 'error', `Title must be ${MAX_TITLE_LEN} characters or fewer.`);
    if (url && body) return flash(response, editUrl, 'error', 'Provide a URL or text, not both.');
    if (!url && !body) return flash(response, editUrl, 'error', 'Either a URL or text is required.');
    if (url) {
      if (url.length > MAX_URL_LEN) return flash(response, editUrl, 'error', `URL must be ${MAX_URL_LEN} characters or fewer.`);
      if (!URL_RE.test(url)) return flash(response, editUrl, 'error', 'URL must start with http:// or https://.');
    }
    if (body && body.length > MAX_BODY_LEN) return flash(response, editUrl, 'error', `Text must be ${MAX_BODY_LEN} characters or fewer.`);

    post.title = title;
    post.url = url || null;
    post.body = body || null;
    await AppDataSource.getRepository(Post).save(post);

    flash(response, `/discussion/item/${id}`, 'ok', 'Post updated.');
  } catch (error) {
    next(error);
  }
});

/** POST /discussion/item/:id/delete — soft-delete, author-only, within window. */
discussionRouter.post('/item/:id/delete', async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = currentUser(request);
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return flash(response, '/discussion', 'error', 'Invalid post.');

    const post = await AppDataSource.getRepository(Post).findOne({
      where: { id },
      relations: ['author'],
    });
    if (!post) return flash(response, '/discussion', 'error', 'Post not found.');
    if (post.author?.id !== user.id) return flash(response, `/discussion/item/${id}`, 'error', 'Not your post.');
    if (!withinEditWindow(post.createdAt)) {
      return flash(response, `/discussion/item/${id}`, 'error', 'Delete window has expired.');
    }

    post.isDeleted = true;
    await AppDataSource.getRepository(Post).save(post);

    flash(response, '/discussion', 'ok', 'Post deleted.');
  } catch (error) {
    next(error);
  }
});

/** GET /discussion/comment/:id/edit — edit form for an existing comment. */
discussionRouter.get('/comment/:id/edit', async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = currentUser(request);
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return flash(response, '/discussion', 'error', 'Invalid comment.');

    const comment = await AppDataSource.getRepository(Comment).findOne({
      where: { id },
      relations: ['author', 'post'],
    });
    if (!comment) return flash(response, '/discussion', 'error', 'Comment not found.');
    const itemUrl = `/discussion/item/${comment.post.id}`;
    if (comment.isDeleted) return flash(response, itemUrl, 'error', 'Comment is deleted.');
    if (comment.author?.id !== user.id) return flash(response, itemUrl, 'error', 'Not your comment.');
    if (!withinEditWindow(comment.createdAt)) {
      return flash(response, itemUrl, 'error', 'Edit window has expired.');
    }

    response.render('discussion-edit-comment', {
      ...config,
      layout: 'member',
      title: `Edit comment · Discussion · ${config.name}`,
      year: new Date().getFullYear(),
      navDiscussion: true,
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      isAdmin: user.isAdmin,
      isReply: false,
      action: `/discussion/comment/${comment.id}/edit`,
      cancelHref: itemUrl,
      formBody: comment.body,
      error: asString(request.query.error) || undefined,
    });
  } catch (error) {
    next(error);
  }
});

/** POST /discussion/comment/:id/edit — save edited comment body. */
discussionRouter.post('/comment/:id/edit', async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = currentUser(request);
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return flash(response, '/discussion', 'error', 'Invalid comment.');

    const comment = await AppDataSource.getRepository(Comment).findOne({
      where: { id },
      relations: ['author', 'post'],
    });
    if (!comment) return flash(response, '/discussion', 'error', 'Comment not found.');
    const itemUrl = `/discussion/item/${comment.post.id}`;
    if (comment.isDeleted) return flash(response, itemUrl, 'error', 'Comment is deleted.');
    if (comment.author?.id !== user.id) return flash(response, itemUrl, 'error', 'Not your comment.');
    if (!withinEditWindow(comment.createdAt)) {
      return flash(response, itemUrl, 'error', 'Edit window has expired.');
    }

    const body = asString(request.body?.body).trim();
    const editUrl = `/discussion/comment/${id}/edit`;
    if (!body) return flash(response, editUrl, 'error', 'Comment cannot be empty.');
    if (body.length > MAX_BODY_LEN) return flash(response, editUrl, 'error', `Comment must be ${MAX_BODY_LEN} characters or fewer.`);

    comment.body = body;
    await AppDataSource.getRepository(Comment).save(comment);

    flash(response, itemUrl, 'ok', 'Comment updated.');
  } catch (error) {
    next(error);
  }
});

/** POST /discussion/comment/:id/delete — soft-delete a comment. */
discussionRouter.post('/comment/:id/delete', async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = currentUser(request);
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return flash(response, '/discussion', 'error', 'Invalid comment.');

    const comment = await AppDataSource.getRepository(Comment).findOne({
      where: { id },
      relations: ['author', 'post'],
    });
    if (!comment) return flash(response, '/discussion', 'error', 'Comment not found.');
    const itemUrl = `/discussion/item/${comment.post.id}`;
    if (comment.author?.id !== user.id) return flash(response, itemUrl, 'error', 'Not your comment.');
    if (!withinEditWindow(comment.createdAt)) {
      return flash(response, itemUrl, 'error', 'Delete window has expired.');
    }

    comment.isDeleted = true;
    await AppDataSource.getRepository(Comment).save(comment);

    flash(response, itemUrl, 'ok', 'Comment deleted.');
  } catch (error) {
    next(error);
  }
});

/** GET /discussion/comment/:id/reply — reply form, posts back to the item's /comment endpoint. */
discussionRouter.get('/comment/:id/reply', async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = currentUser(request);
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return flash(response, '/discussion', 'error', 'Invalid comment.');

    const parent = await AppDataSource.getRepository(Comment).findOne({
      where: { id },
      relations: ['author', 'post'],
    });
    if (!parent) return flash(response, '/discussion', 'error', 'Comment not found.');
    const itemUrl = `/discussion/item/${parent.post.id}`;
    if (parent.isDeleted) return flash(response, itemUrl, 'error', 'Cannot reply to a deleted comment.');

    response.render('discussion-edit-comment', {
      ...config,
      layout: 'member',
      title: `Reply · Discussion · ${config.name}`,
      year: new Date().getFullYear(),
      navDiscussion: true,
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      isAdmin: user.isAdmin,
      isReply: true,
      action: `/discussion/item/${parent.post.id}/comment`,
      parentId: parent.id,
      cancelHref: itemUrl,
      replyingTo: {
        authorUsername: parent.author?.username ?? '[deleted]',
        bodyHtml: formatBody(parent.body),
      },
      formBody: '',
      error: asString(request.query.error) || undefined,
    });
  } catch (error) {
    next(error);
  }
});

