import express, { Request, Response } from 'express';

import { config } from '../shared/config';
import { requireAdmin } from '../middlewares/auth';

export const adminRouter = express.Router();

// The admin dashboard view is a complete HTML document (its own <head> and
// asset shell), so it renders without the site's default layout.
adminRouter.get('/', requireAdmin, (_request: Request, response: Response): void => {
  response.render('admin', {
    ...config,
    layout: false,
    year: new Date().getFullYear(),
  });
});
