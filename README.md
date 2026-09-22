# GuardAsli

<p align="center">
  <img src="public/logo.svg" alt="GuardAsli — AsliCode" width="480" />
</p>

<p align="center">
  <b>Product:</b> GuardAsli ·
  <b>Developer:</b> AsliCode ·
  <b>Release:</b> <code>is0.0.1</code> <b>FINAL</b> ·
  <b>Format:</b> <code>isMAJOR.MINOR.PATCH</code>
</p>

<p align="center">
  <a href="README.fa.md">فارسی</a> ·
  <a href="FINAL_AUDIT.md">Final audit</a> ·
  <a href="Docs.md">Docs</a> ·
  <a href="docs/SECURITY.md">Security</a> ·
  <a href="docs/PRODUCTION.md">Production</a> ·
  <a href="docs/RUNBOOK.md">Runbook</a>
</p>

---

**GuardAsli** is the AsliCode control-plane for selling and operating proxy/VPN services: multi-tenant, server-side RBAC, wallet + immutable ledger, four payment methods, provider adapters, Telegram bot & mini app, web dashboard, independent component versioning.

Core identity is fixed: **GuardAsli** / **AsliCode**.

**Status:** code audit complete — see [FINAL_AUDIT.md](FINAL_AUDIT.md). Production readiness depends on your Convex deploy key, domain DNS, and provider credentials.

---

## One-line install (VPS + domain)

```bash
curl -fsSL https://raw.githubusercontent.com/GuardAsli/SuperApp/main/install.sh | sudo bash -s -- --domain panel.example.com --email admin@example.com
```

Optional non-interactive Convex:

```bash
export CONVEX_DEPLOY_KEY=... ; curl -fsSL https://raw.githubusercontent.com/GuardAsli/SuperApp/main/install.sh | sudo bash -s -- --domain panel.example.com --email admin@example.com
```

Installs to `/opt/guardasli`, generates secrets, builds UI, deploys Convex (if key present), bootstraps admin, configures **Nginx + SSL**, enables **systemd `guardasli`**.

---

## Requirements

### Supported OS

| OS | Versions |
|---|---|
| Ubuntu | **22.04 / 24.04 LTS** (recommended) |
| Debian | 11, 12 |
| Rocky / Alma / RHEL | 9.x |
| Fedora | 39+ |

**Arch:** x86_64, aarch64. **Not** Windows/macOS as VPS targets (use lab install below).

### Resources

| | Minimum | Recommended |
|---|---|---|
| CPU | 1 vCPU | 2 vCPU |
| RAM | 1 GB | 2–4 GB |
| Disk | 10 GB SSD | 20 GB+ |
| Network | Public IPv4 + outbound HTTPS | + IPv6 |

Backend data plane: **Convex Cloud**. VPS serves static UI + reverse proxy + TLS.

---

## Lab / local

```bash
git clone https://github.com/GuardAsli/SuperApp.git && cd SuperApp && bun run wizard && bun run up
```

---

## Commands

| Command | Purpose |
|---|---|
| `install.sh --domain … --email …` | Full VPS install |
| `bun run wizard` | Lab install (no prompts) |
| `bun run up` | Start UI (+ Convex sync/bootstrap) |
| `bun run monitor` | Health + logs summary |
| `bun run monitor:follow` | Tail app/nginx/convex logs |
| `bun run monitor:jobs` | Job queue stats |
| `bun run ci` | typecheck + test + build |
| `bun run prod-start` | Production env gate |

---

## Dashboard (management tabs)

After login the web UI exposes role-aware tabs:

| Tab | Who | Content |
|---|---|---|
| Overview | all | Balance, plans count, role |
| Wallet | all | Balance + ledger history |
| Charge | all | Tetra / CubePay / card-to-card + provider keys |
| Payments | all | Payment history + links |
| Plans | all | Purchase plans |
| Branding | admin+ | White-label colors/name |
| Admin | admin+ | Pending card reviews, manual credit, method toggles (super) |
| Monitor | admin+ | Health targets + job queue snapshot |

Default UI language: **Persian** (toggle EN/FA).

---

## Security highlights

- AES-256-GCM + HKDF purpose keys + AAD  
- scrypt passwords, session pepper, side-channel hardened login  
- Verify-before-credit payments; ledger idempotency  
- CORS allowlist, upload limits, CSP, production env hard-fail  

Details: [docs/SECURITY.md](docs/SECURITY.md) · [docs/PRODUCTION.md](docs/PRODUCTION.md)

---

## Documentation map

| File | |
|---|---|
| [FINAL_AUDIT.md](FINAL_AUDIT.md) | Completion sign-off |
| [Docs.md](Docs.md) / [Docs.fa.md](Docs.fa.md) | Technical reference |
| [Learn.md](Learn.md) / [Learn.fa.md](Learn.fa.md) | Tutorials |
| [docs/RUNBOOK.md](docs/RUNBOOK.md) | Ops |
| [docs/PAYMENTS.md](docs/PAYMENTS.md) | Payments |
| [docs/KMS_AND_SIDECHANNEL.md](docs/KMS_AND_SIDECHANNEL.md) | KMS / timing |

---

## License

Proprietary **AsliCode**. All rights reserved.
