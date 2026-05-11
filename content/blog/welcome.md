---
title: "Welcome to your blog"
date: 2026-05-08
description: "Your first post — drop more markdown files into content/blog/ and they'll show up here, newest first."
author: "Hobo Beach"
tags: ["welcome"]
featured: true
---

# Welcome

This is a sample post shipped with the `blog` plugin for `@hobobeach/express-base`.

## How it works

- Drop a `.md` file into `content/blog/`.
- Add YAML frontmatter at the top with `title`, `date`, `description`, and (optionally) `author`, `image`, `imageAlt`, `tags`, `featured`.
- Restart the dev server. Posts are loaded once into an in-memory cache at boot.

The slug is the filename without the `.md` extension, so this post lives at [/blog/welcome](/blog/welcome).

## What's included

- Routes: `/blog`, `/blog/:slug`, `/blog/feed.xml`, `/blog/sitemap.xml`.
- Markdown rendered with [marked](https://github.com/markedjs/marked); frontmatter parsed with [gray-matter](https://github.com/jonschlinkert/gray-matter).
- A small stylesheet at `/assets/blog.css` you can tweak or replace.

Have fun.
