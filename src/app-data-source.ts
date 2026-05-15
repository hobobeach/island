import { DataSource } from 'typeorm';
import 'reflect-metadata';
// PLUGIN traffic BEGIN
import { RequestLog } from './entities/request-log.entity';
// PLUGIN traffic END
import { InviteRequest } from './entities/invite-request.entity';
import { User } from './entities/user.entity';
// PLUGINS: data-source-import

export const AppDataSource = new DataSource({
    type: 'sqlite',
    database: process.env.DATABASE_NAME || 'database.sqlite',
    entities: [
        // PLUGIN traffic BEGIN
        RequestLog,
        // PLUGIN traffic END
        InviteRequest,
        User,
        // PLUGINS: entities
    ],
    logging: true,
    synchronize: true,
});
