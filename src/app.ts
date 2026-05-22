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
import { signupRouter } from './routes/signup';
import { payRouter } from './routes/pay';
import { adminRouter } from './routes/admin';
import { discussionRouter } from './routes/discussion';
// PLUGIN blog BEGIN
import { blogRouter } from './routes/blog';
// PLUGIN blog END
// PLUGIN seo BEGIN
import { seoRouter } from './routes/seo';
// PLUGIN seo END
// PLUGIN traffic BEGIN
import { trafficLogger } from './middlewares/traffic';
// PLUGIN traffic END
import { globalLimiter } from './middlewares/rate-limit';
import { blockBannedIps } from './middlewares/block-banned-ips';
// PLUGINS: import

const app: Express = express();

// Trust exactly one upstream proxy hop (Render's edge), so `req.ip` resolves
// to the real client IP from X-Forwarded-For. Setting this to `true` would
// let any upstream spoof the header, which express-rate-limit v8 rejects.
app.set('trust proxy', 1);

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
      // Stripe Elements on the custom /pay page: Stripe.js, its card iframe
      // and 3-D Secure frames, and the API calls it makes from the browser.
      'script-src': ["'self'", 'https://js.stripe.com'],
      'frame-src': ["'self'", 'https://js.stripe.com', 'https://hooks.stripe.com'],
      'connect-src': ["'self'", 'https://api.stripe.com'],
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
// Reject banned IPs *after* the traffic logger registers its finish listener
// so 403 responses are still recorded in request_logs.
app.use(blockBannedIps);
// Coarse per-IP cap. Sits after the traffic logger so 429 responses are still
// recorded; static assets are served upstream and bypass it.
app.use(globalLimiter);
// PLUGINS: middleware

app.use('/', indexRouter);
app.use('/login', loginRouter);
app.use('/logout', logoutRouter);
app.use('/signup', signupRouter);
app.use('/pay', payRouter);
app.use('/admin', adminRouter);
app.use('/discussion', discussionRouter);
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