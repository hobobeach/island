import { Router, Request, Response } from 'express';
import { buildSitemap, SitemapEntry } from '../shared/sitemap';
import { getPosts, Post } from '../shared/blog-content';

const siteUrl = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

const staticEntries: SitemapEntry[] = [
  { loc: `${siteUrl}/`, changefreq: 'weekly', priority: 1.0 },
  { loc: `${siteUrl}/blog`, changefreq: 'weekly', priority: 0.7 },
];

export const seoRouter = Router();

seoRouter.get('/sitemap.xml', (_request: Request, response: Response) => {
  const today = new Date().toISOString().slice(0, 10);
  const blogEntries: SitemapEntry[] = getPosts().map((p: Post) => ({
    loc: `${siteUrl}/blog/${p.slug}`,
    lastmod: p.isoDate,
    changefreq: 'monthly',
    priority: 0.6,
  }));
  const entries = [
    ...staticEntries.map((entry) => ({ lastmod: today, ...entry })),
    ...blogEntries,
  ];
  response.type('application/xml');
  response.send(buildSitemap(entries));
});

seoRouter.get('/robots.txt', (_request: Request, response: Response) => {
  response.type('text/plain');
  response.send(`User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`);
});
