# Deployment Guide — Connected PNW

## Overview

The site builds to a static `dist/` directory via Astro. Nginx on your DigitalOcean droplet serves that directory. Deployment is triggered by pushing to the `main` branch.

---

## Server Requirements

- Ubuntu 22.04+ (or equivalent)
- Node.js 18+ (`nvm install --lts` recommended)
- Nginx

---

## Initial Server Setup

### 1. Install Node.js

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc
nvm install --lts
```

### 2. Clone the repository

```bash
git clone https://github.com/YOUR_ORG/connectedpnw.git /var/www/connectedpnw
cd /var/www/connectedpnw
npm install
npm run build
```

### 3. Configure Nginx

Create `/etc/nginx/sites-available/connectedpnw`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name connectedpnw.com www.connectedpnw.com;

    root /var/www/connectedpnw/dist;
    index index.html;

    # Serve pre-built static files; fall back to index.html for SPA-style 404s
    location / {
        try_files $uri $uri/ $uri.html /404.html =404;
    }

    # Cache static assets aggressively
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;
}
```

Enable it:

```bash
ln -s /etc/nginx/sites-available/connectedpnw /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### 4. HTTPS with Certbot

```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d connectedpnw.com -d www.connectedpnw.com
```

---

## Deployment

### Option A — Git post-receive hook (no CI required)

On the server, set up a bare repo:

```bash
git init --bare /var/repo/connectedpnw.git
```

Create `/var/repo/connectedpnw.git/hooks/post-receive`:

```bash
#!/usr/bin/env bash
set -euo pipefail

REPO=/var/www/connectedpnw
BRANCH=main

while read oldrev newrev ref; do
  if [[ "$ref" == "refs/heads/$BRANCH" ]]; then
    echo "--- Deploying $BRANCH ---"
    git --work-tree="$REPO" --git-dir="/var/repo/connectedpnw.git" checkout -f "$BRANCH"
    cd "$REPO"
    npm ci --prefer-offline
    npm run build
    echo "--- Deploy complete ---"
  fi
done
```

```bash
chmod +x /var/repo/connectedpnw.git/hooks/post-receive
```

Add the server as a remote on your local machine:

```bash
git remote add production ssh://user@YOUR_SERVER_IP/var/repo/connectedpnw.git
git push production main
```

### Option B — GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npm run build

      - name: Sync dist to server
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SERVER_SSH_KEY }}
          source: dist/
          target: /var/www/connectedpnw/dist/
          strip_components: 1
```

Set `SERVER_HOST`, `SERVER_USER`, and `SERVER_SSH_KEY` in GitHub → Settings → Secrets.

---

## Quick rebuild on the server

```bash
cd /var/www/connectedpnw
git pull origin main
npm ci --prefer-offline
npm run build
```

Or use the included `deploy.sh` script:

```bash
bash /var/www/connectedpnw/deploy.sh
```

---

## Content updates (no-code)

Staff update content by editing the Markdown files in `src/content/site/` via the GitHub web UI. After saving, a new deploy is triggered automatically (GitHub Actions) or can be triggered manually via `deploy.sh`.

Files to edit:

| File | What it controls |
|---|---|
| `src/content/site/home.md` | Hero heading, subtext, CTAs, difference bullets |
| `src/content/site/model.md` | Coaching model steps |
| `src/content/site/gains.md` | "What participants gain" cards |
| `src/content/site/journey.md` | Program journey timeline |
| `src/content/site/about.md` | About section cards |
| `src/content/site/faq.md` | FAQ questions and answers |
| `src/content/site/contact.md` | Contact page heading and Formspree form action URL |
