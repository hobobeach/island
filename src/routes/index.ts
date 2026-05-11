import express, { Request, Response } from 'express';
import createError from 'http-errors';

import { config } from '../shared/config';

export const indexRouter = express.Router();

indexRouter.get('/', async (request: Request, response: Response): Promise<void> => {

    response.render('index', {
    ...config,
    isHome: true,
  });

});