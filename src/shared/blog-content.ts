import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { marked } from 'marked';

export interface Post {
  slug: string;
  title: string;
  date: Date;
  isoDate: string;
  displayDate: string;
  description: string;
  image: string;
  imageAlt: string;
  author: string;
  tags: string[];
  featured: boolean;
  body: string;
}

const contentDir = path.resolve(__dirname, '../../content/blog');

function loadPosts(): Post[] {
  if (!fs.existsSync(contentDir)) return [];

  const files = fs.readdirSync(contentDir).filter(f => f.endsWith('.md'));
  const posts: Post[] = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(contentDir, file), 'utf8');
      const { data, content } = matter(raw);
      const date = new Date(data.date);

      posts.push({
        slug: file.replace(/\.md$/, ''),
        title: data.title || '(untitled)',
        date,
        isoDate: date.toISOString().split('T')[0],
        displayDate: date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          timeZone: 'UTC',
        }),
        description: data.description || '',
        image: data.image || '',
        imageAlt: data.imageAlt || '',
        author: data.author || 'Anonymous',
        tags: data.tags || [],
        featured: data.featured || false,
        body: marked.parse(content) as string,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.warn(`[blog] failed to parse ${file}: ${message}`);
    }
  }

  posts.sort((a, b) => b.date.getTime() - a.date.getTime());
  return posts;
}

const cache: Post[] = loadPosts();

export function getPosts(): Post[] {
  return cache;
}

export function getPost(slug: string): Post | undefined {
  return cache.find(p => p.slug === slug);
}
