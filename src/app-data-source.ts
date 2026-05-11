import { DataSource } from 'typeorm';
import 'reflect-metadata';
// PLUGIN traffic BEGIN
import { RequestLog } from './entities/request-log.entity';
// PLUGIN traffic END
// PLUGINS: data-source-import

export const AppDataSource = new DataSource({
    type: 'sqlite',
    database: process.env.DATABASE_NAME || 'database.sqlite',
    entities: [
        // PLUGIN traffic BEGIN
        RequestLog,
        // PLUGIN traffic END
        // PLUGINS: entities
    ],
    logging: true,
    synchronize: true,
});
