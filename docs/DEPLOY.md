# Deployment Guide — Connected PNW

## Overview

The site builds to a static `dist/` directory via Astro. GitHub Actions builds `dist/` on every push to `main` and rsyncs it to the DigitalOcean droplet, deleting any files on the server that no longer exist in the new build. Nginx serves that directory. The server never runs `npm` or `git` as part of the deploy pipeline.

---

## How deploys work

1. Push (or merge a PR) to `main`
2. GitHub Actions (`ubuntu-latest`, Node 20) runs `npm ci` then `npm run build`
3. The built `dist/` is synced to `/var/www/connectedpnw/dist/` on the droplet via `rsync -avzr --delete` over SSH
4. Nginx serves the updated files — done

The `--delete` flag matters: without it, removing a page's source (e.g. deleting a blog post's `.md` file) would stop the build from regenerating that page, but the old HTML file would silently keep serving on the droplet forever since nothing ever removes it. `rsync --delete` prunes anything in the server's `dist/` that isn't in the freshly built one, so removed pages actually 404. Requires `rsync` on the droplet — present by default on Ubuntu; install with `apt install -y rsync` if missing.

Workflow file: `.github/workflows/deploy.yml`

Required GitHub secrets (Settings → Secrets → Actions):

| Secret | Value |
|---|---|
| `SERVER_HOST` | Droplet IP or hostname |
| `SERVER_USER` | SSH username |
| `SERVER_SSH_KEY` | Private SSH key (corresponding public key must be in `~/.ssh/authorized_keys` on the server) |

---

## Initial server setup

This only needs to be done once. After this, the server is hands-off for all future deploys.

### 1. Install Nginx

```bash
apt update && apt install -y nginx
```

### 2. Create the web root

```bash
mkdir -p /var/www/connectedpnw/dist
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

    location / {
        try_files $uri $uri/ $uri.html /404.html =404;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

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
apt install -y certbot python3-certbot-nginx
certbot --nginx -d connectedpnw.com -d www.connectedpnw.com
```

---

## Manual rebuild (emergency only)

If you need to deploy without GitHub Actions (e.g. CI is down), SSH into the droplet and build locally:

```bash
# One-time: install Node if not present
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc
nvm install --lts

# Clone repo if not already present
git clone https://github.com/YOUR_ORG/connectedpnw.git /tmp/cnctpnw

# Build and copy
cd /tmp/cnctpnw
npm ci
npm run build
rsync -avzr --delete dist/ /var/www/connectedpnw/dist/
```

Or if the repo is already checked out somewhere on the server:

```bash
cd /path/to/cnctpnw
git pull
npm ci
npm run build
rsync -avzr --delete dist/ /var/www/connectedpnw/dist/
```

---

## Content updates (no-code)

Staff update content by editing the Markdown files in `src/content/site/` via the GitHub web UI. Saving triggers a deploy automatically.

| File | What it controls |
|---|---|
| `src/content/site/home.md` | Hero heading, subtext, CTAs, difference bullets |
| `src/content/site/model.md` | Coaching model steps |
| `src/content/site/gains.md` | "What participants gain" cards |
| `src/content/site/journey.md` | Program journey timeline |
| `src/content/site/about.md` | About section cards |
| `src/content/site/faq.md` | FAQ questions and answers |
| `src/content/site/contact.md` | Contact page heading and Formspree form action URL |
