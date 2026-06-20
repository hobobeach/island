import express, { Request, Response, NextFunction, Router } from 'express';
import { getPosts, getPost, Post } from '../shared/blog-content';
import { config } from '../shared/config';

export const blogRouter: Router = express.Router();

const blogTitle = process.env.BLOG_TITLE || 'Blog';
const blogDescription = process.env.BLOG_DESCRIPTION || 'Latest posts and updates';

let warnedNoSiteUrl = false;
function siteUrl(): string {
  const url = process.env.SITE_URL ?? '';
  if (!url && !warnedNoSiteUrl) {
    warnedNoSiteUrl = true;
    // eslint-disable-next-line no-console
    console.warn('[blog] SITE_URL is not set; feed and sitemap will use relative URLs.');
  }
  return url;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

blogRouter.get('/', (request: Request, response: Response): void => {
  response.render('blog', {
    name: config.name,
    title: blogTitle,
    blogTitle,
    blogDescription,
    posts: getPosts(),
  });
});

blogRouter.get('/feed.xml', (request: Request, response: Response): void => {
  const base = siteUrl();
  const items = getPosts().map((p: Post) => `
    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${base}/blog/${p.slug}</link>
      <guid isPermaLink="true">${base}/blog/${p.slug}</guid>
      <pubDate>${p.date.toUTCString()}</pubDate>
      <description>${escapeXml(p.description)}</description>
    </item>`).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(blogTitle)}</title>
    <link>${base}/blog</link>
    <description>${escapeXml(blogDescription)}</description>${items}
  </channel>
</rss>`;
  response.type('application/xml');
  response.send(xml);
});

blogRouter.get('/:slug', (request: Request, response: Response, next: NextFunction): void => {
  const post = getPost(request.params.slug);
  if (!post) return next();

  const base = process.env.SITE_URL ?? '';
  const canonical = `${base}/blog/${post.slug}`;

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: post.title,
    description: post.description,
    image: post.image || undefined,
    datePublished: post.isoDate,
    author: { '@type': 'Person', name: post.author },
    publisher: { '@type': 'Organization', name: blogTitle },
    mainEntityOfPage: canonical,
  });

  response.render('blog-post', {
    name: config.name,
    title: post.title,
    blogTitle,
    post,
    canonical,
    jsonLd,
  });
});
