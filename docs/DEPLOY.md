# Deployment Guide — Connected PNW

## Overview

The site builds to a static `dist/` directory via Astro. Deploys run on a **GitHub Actions self-hosted runner that lives on the hosting box itself** (`holdens-box`, a home server). On every push to `main` the runner builds `dist/` and publishes it — with `rsync --delete` — straight to the local Nginx web root. Nothing is copied over the network and there are **no deploy secrets**: the build and the web server are on the same machine.

The box has a dynamic public IP, tracked by DuckDNS (`holdens-box.duckdns.org`). The site sits **behind Cloudflare** (proxied / orange-cloud): `connectedpnw.com` and `www` are CNAMEs pointing at the DuckDNS name, so the site follows the home IP automatically.

---

## How deploys work

1. Push (or merge a PR) to `main`
2. The self-hosted runner on holdens-box (`runs-on: [self-hosted, holdens]`) picks up the job
3. It runs `npm ci` then `npm run build` — **using the box's own RAM/CPU**
4. The built `dist/` is published locally with `rsync -a --delete dist/ /var/www/connectedpnw/dist/`
5. Nginx serves the updated files — done

The `--delete` flag matters: without it, removing a page's source (e.g. deleting a blog post's `.md` file) would stop the build from regenerating that page, but the old HTML file would silently keep serving forever since nothing ever removes it. `rsync --delete` prunes anything in the web root that isn't in the freshly built `dist/`, so removed pages actually 404. Requires `rsync` on the box — present by default on Ubuntu; install with `apt install -y rsync` if missing.

Workflow file: `.github/workflows/deploy.yml`

**No GitHub secrets are required** — the runner writes to the local filesystem. (The old SSH-based deploy used `SERVER_HOST` / `SERVER_USER` / `SERVER_SSH_KEY`; these have been removed.)

---

## Initial server setup

This only needs to be done once. After this, deploys are hands-off.

### 1. Install Nginx + Certbot

```bash
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx rsync
```

### 2. Create the web root

```bash
sudo mkdir -p /var/www/connectedpnw/dist
sudo chown -R $USER:$USER /var/www/connectedpnw   # owned by the runner's user
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
sudo ln -s /etc/nginx/sites-available/connectedpnw /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 4. Install the GitHub Actions self-hosted runner

On the box, from repo **Settings → Actions → Runners → New self-hosted runner** (Linux x64). Grab the current version + a registration token there, then:

```bash
mkdir -p ~/actions-runner && cd ~/actions-runner
curl -o runner.tar.gz -L https://github.com/actions/runner/releases/download/vX.Y.Z/actions-runner-linux-x64-X.Y.Z.tar.gz
tar xzf runner.tar.gz
./config.sh --url https://github.com/guyarie/connectedpnw --token <REG_TOKEN> --labels holdens --unattended
sudo ./svc.sh install     # run as a systemd service (survives reboots)
sudo ./svc.sh start
```

It should show as **Idle / online** under Settings → Actions → Runners. The service runs as the install user, which must own `/var/www/connectedpnw/dist`.

### 5. DNS (Cloudflare)

`connectedpnw.com` (apex) and `www` are **CNAMEs → `holdens-box.duckdns.org`**, proxied (orange). Cloudflare flattens the apex CNAME. Ensure **SSL/TLS mode = Full (strict)** since the origin has a valid Let's Encrypt cert. The router must forward **80** and **443** to the box.

### 6. HTTPS with Certbot

```bash
sudo certbot --nginx -d connectedpnw.com -d www.connectedpnw.com
```

> ⚠️ **Cert issuance/renewal + Cloudflare proxy.** Certbot's HTTP-01 (`nginx`) challenge is intercepted by Cloudflare's proxy, so it fails while the record is orange-clouded. Issuing a cert this way requires temporarily setting the records to **DNS-only (grey)**, running certbot, then flipping back to orange.
>
> **Auto-renewal has the same problem** — `certbot renew --dry-run` fails behind the proxy. The durable fix is to switch to the **DNS-01 challenge with a Cloudflare API token** (`python3-certbot-dns-cloudflare`), which validates via DNS and needs no HTTP challenge or grey-clouding:
> ```bash
> sudo apt install -y python3-certbot-dns-cloudflare
> # store a scoped (Zone:DNS:Edit) token in /root/.secrets/certbot/cloudflare.ini (chmod 600)
> sudo certbot certonly --dns-cloudflare \
>   --dns-cloudflare-credentials /root/.secrets/certbot/cloudflare.ini \
>   -d connectedpnw.com -d www.connectedpnw.com \
>   --deploy-hook "systemctl reload nginx"
> sudo certbot renew --dry-run   # should now pass
> ```

---

## Manual rebuild (emergency only)

If GitHub Actions/the runner is down, build directly on the box:

```bash
cd /path/to/checkout      # or: git clone https://github.com/guyarie/connectedpnw.git
git pull
npm ci
npm run build
rsync -a --delete dist/ /var/www/connectedpnw/dist/
```

---

## Content updates (no-code)

Staff update content by editing the Markdown files in `src/content/site/` via the GitHub web UI. Saving triggers a deploy automatically.

| File | What it controls |
|---|---|
| `src/content/site/home.md` | Home page: hero, starting points, difference points, closing CTA |
| `src/content/site/how.md` | How it works — the three program phases |
| `src/content/site/team.md` | Founders page: intro, bios, values |
| `src/content/site/faq.md` | FAQ questions and answers |
| `src/content/site/blog.md` | Blog listing heading and intro |
| `src/content/site/contact.md` | Interest-list page heading and Formspree form action URL |
| `src/content/site/events.md` | Events list (upcoming/past split by date at build time) |
| `src/content/site/banner.md` | Home-page banner image (currently disabled) |
