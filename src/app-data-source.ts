import path from 'path';
import { DataSource } from 'typeorm';
import 'reflect-metadata';
// PLUGIN traffic BEGIN
import { RequestLog } from './entities/request-log.entity';
// PLUGIN traffic END
import { InviteRequest } from './entities/invite-request.entity';
import { User } from './entities/user.entity';
import { Post } from './entities/post.entity';
import { Comment } from './entities/comment.entity';
import { PostUpvote } from './entities/post-upvote.entity';
import { CommentUpvote } from './entities/comment-upvote.entity';
import { BannedIp } from './entities/banned-ip.entity';
// PLUGINS: data-source-import

// Resolve the SQLite file location. `DATABASE_PATH` (a full path) takes
// precedence; otherwise `DATABASE_NAME` (a bare filename) or the default.
// Relative values are anchored to the repo root so the location doesn't
// depend on the process's working directory.
const databaseSetting = process.env.DATABASE_PATH
    || process.env.DATABASE_NAME
    || 'database.sqlite';
const databaseFile = path.isAbsolute(databaseSetting)
    ? databaseSetting
    : path.resolve(__dirname, '..', databaseSetting);

export const AppDataSource = new DataSource({
    type: 'better-sqlite3',
    database: databaseFile,
    entities: [
        // PLUGIN traffic BEGIN
        RequestLog,
        // PLUGIN traffic END
        InviteRequest,
        User,
        Post,
        Comment,
        PostUpvote,
        CommentUpvote,
        BannedIp,
        // PLUGINS: entities
    ],
    logging: true,
    synchronize: true,
});
