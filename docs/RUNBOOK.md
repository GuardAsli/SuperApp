# GuardAsli is0.0.1 — Production Runbook (VPS)

**Product:** GuardAsli · **Developer:** AsliCode

## Supported OS & resources

See root [README.md](../README.md) — Ubuntu 22.04/24.04 recommended; min 1 vCPU / 1 GB RAM; recommended 2 vCPU / 2–4 GB.

## One-command VPS install

```bash
export CONVEX_DEPLOY_KEY=...
sudo bash install.sh --domain panel.example.com --email you@example.com
```

Installer path: `/opt/guardasli` · unit: `guardasli.service` · proxy: nginx · SSL: certbot.

## After install

```bash
systemctl status guardasli
journalctl -u guardasli -f
cd /opt/guardasli && bash scripts/finish-vps.sh   # if Convex was pending
```

## Bootstrap

`scripts/auto-bootstrap.mjs`:

- Reads `.env.local`
- Ensures strong admin password (writes back if weak)
- Retries up to 5 times with backoff
- Treats “already bootstrapped” as success

Manual:

```bash
bunx convex run authActions:bootstrapAdminAction \
  '{"username":"admin","password":"YourStrongPass1"}'
```

## Convex on VPS (performance)

- **Do not** leave `convex dev` running long-term on production VPS.
- Use `convex deploy` + cloud backend.
- UI process only: `bun run preview` behind nginx (systemd).
- Set all `GUARDASLI_*` secrets in Convex Dashboard env — the installer does this
  automatically after every deploy (`bun run sync-env`). Verify with:
  `sudo guardasli env`.
- Indexes in schema are required for tenant-scoped queries — already defined.

## Domain & SSL

1. DNS A record → VPS IP
2. `install.sh --domain … --email …`
3. `GUARDASLI_PUBLIC_URL` and CORS become `https://domain`
4. Payment webhooks use that public URL
5. The deployment env is re-synced, so the bot webhook repairs itself

## Telegram bot webhook

The webhook is fully automatic — you rarely need to touch it.

- Saving the bot configuration registers the webhook immediately when
  `GUARDASLI_PUBLIC_URL` is set on the deployment (which the installer does).
- A daily cron re-registers the webhook for every enabled bot, so a webhook
  deleted in @BotFather comes back on its own within 24 hours.
- `/webhook` in the bot with **no argument** uses the server-configured domain.
- The admin panel button works with an empty field for the same reason.

| Symptom | Cause | Fix |
| --- | --- | --- |
| `GUARDASLI_MASTER_SECRET … پیکربندی نشده` | deployment env not synced | `sudo guardasli convex` (or re-run installer) |
| `آدرس خصوصی مجاز نیست` | private/loopback IP or `.local` domain | use the public https domain |
| Bot silent, webhook shows old date | secret rotated by an old save | save once, then press Set webhook |
| Menu button missing | BotFather needs the Mini App URL | `/miniapp https://…`, then set it in BotFather |

## Health

```bash
bun run ci
curl -fsS https://your-domain/ | head
systemctl is-active guardasli
```

## Backup

```bash
bash scripts/guardasli.sh backup
```

Encrypted only.

## Incident

- `systemctl restart guardasli`
- Disable payment methods in panel if provider compromised
- Rotate `GUARDASLI_MASTER_SECRET` only with re-encrypt plan (see SECURITY.md)
