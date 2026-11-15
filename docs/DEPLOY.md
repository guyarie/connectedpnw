# Deployment Guide — Connected PNW

## Overview

The site builds to a static `dist/` directory via Astro. Deploys run on a **GitHub Actions self-hosted runner that lives on the hosting box itself** (`eli`, a mini PC on the home network). On every push to `main` the runner builds `dist/` and publishes it — with `rsync --delete` — straight to the local Nginx web root. Nothing is copied over the network and there are **no deploy secrets**: the build and the web server are on the same machine.

Visitors reach eli through a **Cloudflare Tunnel** (`eli-connectedpnw`, in the connectedpnw.com Cloudflare account). `cloudflared` on eli opens an outbound connection to Cloudflare, so there are **no router port-forwards, no DuckDNS and no origin TLS certificate** — Cloudflare terminates HTTPS at the edge and hands requests to Nginx on `127.0.0.1:8080`.

```
visitor ──HTTPS──▶ Cloudflare ──tunnel──▶ cloudflared (eli) ──HTTP──▶ Nginx 127.0.0.1:8080 ──▶ /var/www/connectedpnw/dist
```

---

## How deploys work

1. Push (or merge a PR) to `main`
2. The self-hosted runner on eli (`runs-on: [self-hosted, eli]`) picks up the job
3. It runs `npm ci` then `npm run build` — **using the box's own RAM/CPU**
4. The built `dist/` is published locally with `rsync -a --delete dist/ /var/www/connectedpnw/dist/`
5. Nginx serves the updated files — done

The `--delete` flag matters: without it, removing a page's source (e.g. deleting a blog post's `.md` file) would stop the build from regenerating that page, but the old HTML file would silently keep serving forever since nothing ever removes it. `rsync --delete` prunes anything in the web root that isn't in the freshly built `dist/`, so removed pages actually 404. Requires `rsync` on the box — present by default on Ubuntu; install with `apt install -y rsync` if missing.

Workflow file: `.github/workflows/deploy.yml`

**No GitHub secrets are required** — the runner writes to the local filesystem. (The old SSH-based deploy used `SERVER_HOST` / `SERVER_USER` / `SERVER_SSH_KEY`; these have been removed.)

> **Upcoming vs past events are decided at build time.** A past event stays listed as upcoming until the next deploy. Re-run the latest Deploy workflow from the Actions tab to refresh it without a content change.

---

## Initial server setup

This only needs to be done once. After this, deploys are hands-off. eli runs Ubuntu and is shared with other apps (e.g. `transcribe-it`, which has its own Cloudflare tunnel) — keep the site's Nginx site, runner and tunnel separate from them.

### 1. Install Nginx

```bash
sudo apt update && sudo apt install -y nginx rsync
```

Node does **not** need to be installed — the workflow's `actions/setup-node` step downloads it.

### 2. Create the web root

```bash
sudo mkdir -p /var/www/connectedpnw/dist
sudo chown -R $USER:$USER /var/www/connectedpnw   # owned by the runner's user
```

### 3. Configure Nginx

Create `/etc/nginx/sites-available/connectedpnw`. It listens **only on localhost** — the tunnel is the only way in:

```nginx
server {
    listen 127.0.0.1:8080;
    server_name connectedpnw.com www.connectedpnw.com;

    root /var/www/connectedpnw/dist;
    index index.html;
    # Behind the tunnel Nginx would otherwise build redirects like
    # http://connectedpnw.com:8080/events/ — send relative ones instead.
    absolute_redirect off;

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
./config.sh --url https://github.com/guyarie/connectedpnw --token <REG_TOKEN> --name eli --labels eli --unattended
sudo ./svc.sh install     # run as a systemd service (survives reboots)
sudo ./svc.sh start
```

It should show as **Idle / online** under Settings → Actions → Runners. The service runs as the install user, which must own `/var/www/connectedpnw/dist`.

### 5. Cloudflare Tunnel

The tunnel lives in the **connectedpnw.com Cloudflare account** (not the account that holds eli's other tunnels), so it runs as its own `cloudflared` service next to them.

1. Cloudflare dashboard (connectedpnw account) → **Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared**, name `eli-connectedpnw`. Copy only the token from the install command shown — **don't run `cloudflared service install`**: eli already has a `cloudflared` service and that command would replace it.
2. On eli, save the token (paste, then Enter; it isn't echoed or saved to history):
   ```bash
   read -rs T && echo "$T" | sudo tee /etc/cloudflared/connectedpnw.token >/dev/null && sudo chmod 600 /etc/cloudflared/connectedpnw.token && unset T
   ```
3. Create `/etc/systemd/system/cloudflared-connectedpnw.service`:
   ```ini
   [Unit]
   Description=Cloudflare Tunnel (connectedpnw.com)
   After=network-online.target
   Wants=network-online.target

   [Service]
   Type=notify
   ExecStart=/usr/bin/cloudflared --no-autoupdate tunnel run --token-file /etc/cloudflared/connectedpnw.token
   Restart=on-failure
   RestartSec=5s

   [Install]
   WantedBy=multi-user.target
   ```
   ```bash
   sudo systemctl daemon-reload && sudo systemctl enable --now cloudflared-connectedpnw
   ```
4. In the tunnel → **Routes → Add route → Published application**, add one route per hostname, each with service **HTTP** `127.0.0.1:8080`:

   | Subdomain | Purpose |
   |---|---|
   | *(empty)* | `connectedpnw.com` |
   | `www` | `www.connectedpnw.com` |
   | `eli-test` | Test address — point it at a different port/site to try a change before moving the main routes |

   Use **HTTP**, not HTTPS (Nginx speaks plain HTTP on 8080), and `127.0.0.1`, not `localhost` (on eli `localhost` resolves to `::1` first, which Nginx doesn't listen on). Cloudflare creates the DNS records for each route; if a hostname already has a DNS record, delete it first.

### 6. HTTPS

Nothing to install on eli — Cloudflare handles certificates at the edge. In the connectedpnw.com zone, **SSL/TLS → Edge Certificates → Always Use HTTPS** must be **on**, otherwise `http://` requests are served without redirecting.

### Troubleshooting

| Symptom | Likely cause |
|---|---|
| **502** on every page | Route service type set to HTTPS, or `localhost` instead of `127.0.0.1`. Check `journalctl -u cloudflared-connectedpnw -n 20`. |
| **1033** / tunnel error page | `cloudflared-connectedpnw` isn't running: `sudo systemctl status cloudflared-connectedpnw`. |
| Redirects go to `…:8080/…` | `absolute_redirect off;` missing from the Nginx site. |
| Pushes don't deploy | Runner offline: `sudo systemctl status 'actions.runner.*'` on eli; check Settings → Actions → Runners. |

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
