import hbs from 'express-handlebars';
import cookieParser from 'cookie-parser';
import createError from 'http-errors';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import passport from 'passport';
import express, { 
  Express, Request, Response, NextFunction 
} from 'express';
import dotenv from 'dotenv';

import { config } from './shared/config';
import { errorHandler } from './middlewares/error';
import { log } from './shared/log';

const environment = process.env.NODE_ENV || 'development';
dotenv.config({
  path: path.resolve(__dirname, `../.env.${environment}`)
});
log('Server is running in the ' + environment + ' environment.');

import { jwtStrategy } from './shared/jwt';
import { indexRouter } from './routes/index';
import { inviteRouter } from './routes/invite';
import { loginRouter, logoutRouter } from './routes/login';
import { adminRouter } from './routes/admin';
// PLUGIN blog BEGIN
import { blogRouter } from './routes/blog';
// PLUGIN blog END
// PLUGIN seo BEGIN
import { seoRouter } from './routes/seo';
// PLUGIN seo END
// PLUGIN traffic BEGIN
import { trafficLogger } from './middlewares/traffic';
// PLUGIN traffic END
// PLUGINS: import

const app: Express = express();

passport.use('jwt', jwtStrategy);

app.engine('hbs', hbs({
  partialsDir: [
    path.join(__dirname, '../views/partials'),
  ],
  extname: 'hbs',
  defaultLayout: config.layout
}));
app.set('views', path.join(__dirname, '../views'));
app.set('view engine', 'hbs');
// PLUGINS: view-helpers

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
    },
  },
}));
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(cookieParser());
app.use(passport.initialize());
app.use(express.static(path.join(__dirname, '../public')));
// PLUGIN traffic BEGIN
app.use(trafficLogger);
// PLUGIN traffic END
// PLUGINS: middleware

app.use('/', indexRouter);
app.use('/login', loginRouter);
app.use('/logout', logoutRouter);
app.use('/admin', adminRouter);
app.use('/api/invite', inviteRouter);
// PLUGIN blog BEGIN
app.use('/blog', blogRouter);
// PLUGIN blog END
// PLUGIN seo BEGIN
app.use('/', seoRouter);
// PLUGIN seo END
// PLUGINS: routes

// Catch 404s and forward to error handler
app.use((request: Request, response: Response, next: NextFunction) => {
  next(createError(404, 'The requested resource was not found.'));
});
app.use(errorHandler);

export default app;