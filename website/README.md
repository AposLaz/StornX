# StornX Documentation Site

This is the public documentation site for [StornX](https://github.com/AposLaz/StornX), built with [Docusaurus 3](https://docusaurus.io/).

## Develop

```bash
cd website
npm install
npm start
```

The site opens at http://localhost:3000/StornX/.

## Build

```bash
npm run build         # generates static site into ./build
npm run serve         # serves the production build locally
```

## Structure

```
website/
├── docs/                       # All Markdown documentation
│   ├── introduction/           # What / Why / Core concepts
│   ├── architecture/           # Overview, OptiScaler, OptiBalancer, Integrations
│   ├── getting-started/        # Prerequisites, Installation, Configuration
│   ├── guides/                 # Use cases, Tuning, Troubleshooting
│   ├── benchmarks/             # Validation & benchmark write-ups
│   ├── roadmap.md
│   └── faq.md
├── src/                        # React components, custom pages, theme overrides
├── static/img/                 # Logos + all thesis figures, served as /img/...
├── docusaurus.config.ts        # Site config + navbar + footer + mermaid
└── sidebars.ts                 # Sidebar layout
```

## Edit the docs

All pages are plain Markdown (with optional MDX). Edit any file under `docs/`, save, and `npm start` hot-reloads.

Internal links use the `slug:` declared in each page's front-matter. Images live in `static/img/...` and are referenced as `/StornX/img/...` because of the configured `baseUrl`.

## Deploy

### GitHub Pages

The site is configured for `https://aposlaz.github.io/StornX/`:

```bash
GIT_USER=AposLaz npm run deploy
```

### Any static host

```bash
npm run build
# upload ./build to Netlify, Vercel, S3+CloudFront, Cloudflare Pages, etc.
```

## License

Apache 2.0 - same as the rest of the StornX repository.
