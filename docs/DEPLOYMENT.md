# GuardAsli — Deployment Guide (Step by Step)

**Product:** GuardAsli · **Developer:** AsliCode · **Coded by AsliCode** · Version `is0.0.1`

This guide takes you from a fresh Ubuntu 24.04 server to a running, selling-ready
panel.

---

## 0. What you need before starting

| Item | Where to get it |
|---|---|
| A fresh Ubuntu 24.04 (or 22.04) server, root access | Your VPS provider |
| A domain (optional but recommended) pointed to the server IP | Your DNS provider |
| A **full Convex deploy key** — see Step 2 *(optional — the panel installs without it and you can connect the backend later)* | dashboard.convex.dev |

Everything else (bun, nginx, certbot, firewall, service) is installed by the
installer automatically. No other packages needed.

---

## 1. One command — install

SSH into your server as root and run a single command; it downloads and opens
the installer right away:

```bash
sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/GuardAsli/SuperApp/main/install.sh)"
```

That is the whole install. The installer asks up to three short questions
(domain, SSL email, deploy key — all skippable) and does everything else
itself. Prefer a checkout instead? `git clone` then `sudo bash install.sh`
works identically.

---

## 2. Get your Convex deploy key (optional, but the panel needs a backend)

The backend of GuardAsli runs on Convex — that is where the database, users,
wallet, payments and bots live. To create that backend you need a **deploy key**.
You can paste it during the install, or leave it empty and add it afterwards
with `sudo guardasli convex`.

1. Open <https://dashboard.convex.dev> and sign up / log in (free plan is enough).
2. Create a project (any name, e.g. `guardasli`).
3. Go to your project → **Settings → Deploy Keys**.
4. Click **Create** and copy the **whole** key. It looks like this:

   ```
   prod:guardasli-abc123|eyJ2MiI6OGIyZWZjYTdkYjM2NDU4YmI5OTRlNzcyOTMwN2Q3MX0=
   ```

   Copy the entire value including the `prod:...|` prefix.

Keep this key private. It is used once, during the deploy step.

The wizard asks:

| Question | What to answer |
|---|---|
| Domain for the panel | e.g. `panel.example.com` — or press Enter to skip and use the server IP |
| Email for SSL | Your email (only if you gave a domain) |
| Internal web port | Press Enter for `4173` |
| **Convex deploy key** | Paste the full key from Step 2, **or just press Enter to skip** and connect the backend later with `sudo guardasli convex` |

If you prefer to pass things up front:

```bash
sudo bash install.sh \
  --domain panel.example.com \
  --email you@example.com \
  --deploy-key 'prod:guardasli-abc123|eyJ2MiI6...'
```

Or skip the backend entirely for now: `sudo bash install.sh --skip-convex`
(you can add it later — see Step 6).

---

## 4. What the installer does (and what you will see)

The installer performs, in order:

1. Installs system packages, bun, nginx, certbot, firewall
2. Detects your **server public IP automatically** (never uses `127.0.0.1` for
   public URLs — loopback/link-local addresses are filtered)
3. Generates all secrets (master key, token pepper, AEAD salt, admin password)
4. Validates the deploy key format (when provided) and **deploys the backend**
   to your Convex deployment. With no key, the install continues and prints a
   single `Backend pending` note — nothing blocks
5. **Verifies the backend is really alive**: polls `/api/v1/health` up to 5 times
   until it reports `"database":"ok"` — the install is not called complete
   without this proof (skipped when no backend was deployed)
6. Creates the super admin (username `admin`, random strong password — printed
   at the end and stored in `/opt/guardasli/.env`)
7. Sets up Nginx + automatic SSL (Let's Encrypt) if a domain was given
8. Installs the `guardasli` management command and opens the management panel

At the end you see a summary: panel URL, server IP, backend URL, admin
username + password. **Save the admin password somewhere safe.**

A successful install ends with a line like:

```
[ OK ] backend live — database ok (https://your-deployment.convex.site/api/v1/health)
```

If you instead see `Backend pending`, the deploy key was missing/wrong —
continue with Step 6.

---

## 5. First login

Open the panel URL from the summary (with a domain: `https://panel.example.com`,
without: `http://<server-ip>:4173`).

Log in with `admin` + the printed password. You are now in the dashboard.

Recommended first setup, in order:

1. **Create a tenant** — Admin dashboard → Tenants
2. **Brand it** — logo, colors, domain (fully white-label; only the GuardAsli
   core identity is fixed)
3. **Plans + features** — what you will sell
4. **Add an upstream provider** — Servers section (four API families:
   inbound-panel / rest-panel / rest-panel-plus / rest-open), capability is
   auto-detected from the panel health
5. **Enable a payment method** — Payments section (manual, card-to-card,
   CubePay, Tetraminator)
6. **Telegram bot** — token is stored encrypted (AES-256-GCM)

---

## 6. If you need to (re)do the backend later

Two equivalent ways:

**A. Management panel (recommended):**

```bash
sudo guardasli
# choose 16) Convex backend deploy
# paste the full deploy key when asked
```

**B. Re-run the installer:**

```bash
sudo bash install.sh --deploy-key 'prod:...|...'
```

Both validate the key, deploy, verify the live health check and restart the
service. Existing secrets are preserved.

---

## 7. Day-to-day operations

```bash
sudo guardasli panel     # interactive management panel (18 options)
sudo guardasli status    # install + service status
sudo guardasli doctor    # system health checks
sudo guardasli backup    # backup (env + SSL + optional DB export)
sudo guardasli logs      # recent app logs
sudo guardasli update    # update to latest main
```

---

## 8. Verify everything works (60-second sanity check)

```bash
# 1 — service
sudo guardasli status

# 2 — backend (replace with your deployment URL)
curl https://your-deployment.convex.site/api/v1/health
# expect: {"code":"OK",...,"checks":{"api":"ok","database":"ok"},...}

# 3 — panel in a browser
http://<server-ip>:4173   (or https://panel.example.com)
```

---

## 9. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Installer rejects my key | You pasted only the token part. Copy the whole value including `prod:...|` from Settings → Deploy Keys |
| `Backend pending` in summary | No deploy key given. Run `sudo guardasli` → option 16, paste the full key |
| Health check never turns ok | Deployment just created — wait a minute, re-run `sudo guardasli` option 16, or test `curl <backend>/api/v1/health` manually |
| `convex deploy` says InvalidDeploymentName | Key is malformed/truncated — create a fresh key in the dashboard |
| SSL fails | DNS for the domain must point to this server IP first; then `certbot --nginx -d your-domain --redirect` |
| Forgot admin password | `sudo guardasli` → option 5 (Create super admin) |

---

## 10. Local development (optional)

```bash
git clone https://github.com/GuardAsli/SuperApp.git guardasli && cd guardasli
bun install
bun convex dev --once      # links a dev deployment, writes VITE_CONVEX_URL
bun dev                    # http://localhost:5173
```

```bash
bun test        # 88 tests
bun typecheck   # zero errors
bun run build   # production bundle in dist/
```

---

© AsliCode — GuardAsli `is0.0.1`
