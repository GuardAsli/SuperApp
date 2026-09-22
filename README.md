# GuardAsli

**Product:** GuardAsli · **Developer:** AsliCode · **Release:** **is0.0.1 FINAL**

Control-plane for sales, wallet, payments, resellers, Telegram, and provisioning.

[FINAL_AUDIT.md](FINAL_AUDIT.md) · [docs/RUNBOOK.md](docs/RUNBOOK.md)

---

## Requirements

### Supported operating systems (installer tested targets)

| OS | Versions |
|---|---|
| **Ubuntu** | 22.04 LTS, 24.04 LTS (recommended) |
| **Debian** | 12 (Bookworm), 11 (Bullseye) |
| **Rocky Linux / AlmaLinux** | 9.x |
| **Fedora** | 39+ |
| **RHEL** | 9.x (packages via dnf/yum) |

**Architecture:** `x86_64` (amd64) and `aarch64` (arm64).

**Not supported as VPS target:** Windows Server, macOS (use local `bun run wizard` for dev only).

### Minimum resources (VPS)

| Resource | Minimum | Recommended |
|---|---|---|
| CPU | 1 vCPU | 2 vCPU |
| RAM | 1 GB | 2–4 GB |
| Disk | 10 GB SSD | 20 GB+ SSD |
| Network | 100 Mbps, public IPv4 | + IPv6 optional |
| Swap | 1 GB if RAM=1 GB | 2 GB |

Backend data plane runs on **Convex Cloud** (outbound HTTPS required). The VPS mainly serves the static web UI + reverse proxy + SSL.

### Software prerequisites

- Root or passwordless sudo on the VPS
- Outbound HTTPS (443) to GitHub, bun.sh, Convex, Let’s Encrypt
- DNS **A/AAAA** record for your domain → server IP (before SSL)
- Convex account + recommended `CONVEX_DEPLOY_KEY` for non-interactive deploy

---

## VPS install (production + domain) — one shot

```bash
# روی سرور لینوکس:
export CONVEX_DEPLOY_KEY="your-deploy-key"   # توصیه می‌شود
sudo bash -c 'curl -fsSL https://raw.githubusercontent.com/GuardAsli/SuperApp/main/install.sh | bash -s -- \
  --domain panel.example.com \
  --email admin@example.com'
```

Or from a cloned tree:

```bash
sudo bash install.sh --domain panel.example.com --email admin@example.com
```

What `install.sh` does automatically:

1. Installs system packages (git, nginx, certbot, …)
2. Installs **bun**
3. Clones/updates repo to `/opt/guardasli`
4. Generates production secrets in `.env.local`
5. `bun install` + typecheck + test + build
6. Convex deploy + env sync (if deploy key / URL present)
7. Super Admin bootstrap
8. Nginx reverse-proxy for your domain
9. Let’s Encrypt SSL (when `--email` set and DNS points to server)
10. **systemd** service `guardasli` (auto-restart)

Credentials are printed at the end and stored in `/opt/guardasli/.env.local`.

Finish after first-time Convex login (if no deploy key):

```bash
cd /opt/guardasli
bunx convex login && bunx convex deploy
bash scripts/finish-vps.sh
```

---

## Local / lab (optional)

```bash
git clone https://github.com/GuardAsli/SuperApp.git && cd SuperApp
bun run wizard
bun run up
```

---

## Commands

| Command | Purpose |
|---|---|
| `sudo bash install.sh --domain … --email …` | Full VPS install |
| `bash scripts/finish-vps.sh` | Deploy + bootstrap + restart |
| `bun run wizard` | Dev/lab install |
| `bun run up` | Lab bring-up |
| `systemctl status guardasli` | Service health |

---

## Docs

- [FINAL_AUDIT.md](FINAL_AUDIT.md)
- [Docs.md](Docs.md) / [Docs.fa.md](Docs.fa.md)
- [docs/SECURITY.md](docs/SECURITY.md) · [docs/PRODUCTION.md](docs/PRODUCTION.md)
- [docs/PAYMENTS.md](docs/PAYMENTS.md)

**GuardAsli** by **AsliCode** · version format `isMAJOR.MINOR.PATCH`
