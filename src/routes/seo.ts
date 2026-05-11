import { Router, Request, Response } from 'express';
import { buildSitemap, SitemapEntry } from '../shared/sitemap';

const siteUrl = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

const sitemapEntries: SitemapEntry[] = [
  { loc: `${siteUrl}/`, changefreq: 'weekly', priority: 1.0 },
];

export const seoRouter = Router();

seoRouter.get('/sitemap.xml', (_request: Request, response: Response) => {
  const today = new Date().toISOString().slice(0, 10);
  const entries = sitemapEntries.map((entry) => ({ lastmod: today, ...entry }));
  response.type('application/xml');
  response.send(buildSitemap(entries));
});

seoRouter.get('/robots.txt', (_request: Request, response: Response) => {
  response.type('text/plain');
  response.send(`User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`);
});
