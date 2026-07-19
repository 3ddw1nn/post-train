# Post Train

> Ship social media faster. Schedule posts once, publish everywhere. Real OAuth, AI video generation, and analytics across Twitter, LinkedIn, Mastodon, Bluesky, and more.

[![Vercel](https://img.shields.io/badge/deployed%20on-Vercel-000?style=flat&logo=vercel)](https://post-train.vercel.app)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Features

### 📱 Multi-Platform Publishing
- **Real OAuth flows** — Twitter, LinkedIn, Mastodon, Bluesky
- **One-click publish** — compose once, schedule to multiple platforms
- **Queue slots** — timezone-aware scheduling with smart slot allocation
- **Real-time post tracking** — draft → scheduled → posted/failed

### 💰 Billing & Entitlements
- Stripe integration (4 tiers: Starter, Creator, Growth, Pro)
- Monthly/yearly subscriptions with proration
- API add-ons for heavy users
- Founder staff override for testing

### 🎥 Content Studio (AI Video Generation)
- **2×2 Grid Compositing** — combine up to 4 video clips locally
- **Fade-in Template** — single clip with text overlay
- **AI UGC Creator** — generate talking-head videos
  - **Stock personas** via Creatify (1500+ ready-made avatars)
  - **Custom personas** via fal.ai (upload your face → TTS → AI avatar)
- Monthly generation cap per workspace; purchasable credits

### 📊 Analytics
- Per-post engagement tracking
- Platform-specific metrics (coming: TikTok, YouTube, Instagram)

### 🔐 Enterprise Ready
- Workspace roles (owner, member) with granular permissions
- Team invitations and member management
- Encrypted credential storage (AES-256-GCM)
- Signed webhooks (HMAC-SHA256)
- Public API v1 with hashed keys and rate limiting

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 15 + React 19 + TypeScript |
| **Backend** | Convex (real-time database + functions) |
| **Media Storage** | Cloudflare R2 |
| **Background Worker** | Render (free tier) |
| **Billing** | Stripe (sandbox) |
| **Video Processing** | Local ffmpeg (Alpine Linux) |
| **Transactional Email** | Brevo |
| **Deployment** | Vercel (app) + Render (worker) |

---

## Getting Started

### Prerequisites
- Node.js 24+ (with pnpm 10+)
- Cloudflare R2 bucket (free tier)
- Convex account (free tier)
- OAuth credentials (optional for local testing)

### Local Development

```bash
# Install dependencies
pnpm install

# Start Convex
npx convex dev

# In another terminal, start Next.js
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The app uses **mock OAuth** by default — no real API keys needed to explore features.

**Env vars** (`.env.local`):
- `CONVEX_DEPLOYMENT_NAME` — your Convex project (auto-set by `convex dev`)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — optional (uses mock login if absent)
- `R2_*` — optional (uses local `/tmp` disk fallback if absent)

See [Environment Variables](docs/PRODUCTION.md#env-vars) for the full list.

---

## Deployment

### Production (Vercel + Render + Convex)

```bash
# Vercel app
vercel deploy --prod

# Render worker
git push origin main  # auto-triggers via GitHub integration
```

See [PRODUCTION.md](docs/PRODUCTION.md) for the full production launch checklist (domain setup, Stripe production migration, etc.).

### Local Testing Against Production

```bash
# Use prod Convex + R2
CONVEX_DEPLOYMENT_NAME=prod npx convex env get
pnpm dev
```

---

## Project Status

✅ **Shipped:**
- Multi-platform OAuth (Twitter, LinkedIn, Mastodon, Bluesky)
- Real post publishing (text-only; media is per-platform)
- Stripe billing (sandbox mode)
- Content Studio video generation (all 3 templates)
- Workspace roles and team management

📋 **Current Sprint:** See [docs/TODO.md](docs/TODO.md)

🚀 **Pre-Launch:** See [docs/PRODUCTION.md](docs/PRODUCTION.md)

For a detailed breakdown, see [docs/FINISHED.md](docs/FINISHED.md).

---

## Architecture

```
┌─────────────────────────────────────┐
│  Next.js App (Vercel)               │
│  ├─ /app           Pages + API      │
│  ├─ /components    React components │
│  └─ /lib           Utilities        │
└────────────┬────────────────────────┘
             │ HTTPS
             ▼
      ┌──────────────────────────────┐
      │  Convex Backend              │
      │  ├─ Database schema          │
      │  ├─ Mutations & queries      │
      │  └─ Scheduled workflows      │
      └──────┬───────────────────────┘
             │
    ┌────────┼─────────────┐
    │        │             │
    ▼        ▼             ▼
  ┌──┐  ┌────────┐  ┌──────────┐
  │R2│  │Stripe  │  │Brevo     │
  └──┘  │Webhook │  │Email API │
        └────────┘  └──────────┘

┌─────────────────────────────────────┐
│  Render Worker (pinger-woken)       │
│  ├─ 15s worker tick                 │
│  ├─ FFmpeg video compositing        │
│  ├─ Post publishing fan-out         │
│  └─ Email queueing                  │
└────────────┬────────────────────────┘
             │
        ┌────┴─────┬────────────┐
        │           │            │
        ▼           ▼            ▼
    ┌────────┐ ┌────────┐ ┌──────────┐
    │Twitter │ │LinkedIn│ │Mastodon  │
    │ API    │ │ API    │ │ Instance │
    └────────┘ └────────┘ └──────────┘
```

**Hybrid Deployment Model:**
- **Vercel:** Fast, stateless HTTP layer (Next.js app)
- **Render:** Free CPU for background jobs (worker, ffmpeg, email queueing)
- **Cron pinger:** External wakeup every 5 minutes (cron-job.org) prevents idle spin-down
- **Convex:** Real-time DB + function orchestration (free tier)
- **R2:** Media storage (free tier)

---

## API

### Public API (v1)

Base: `https://post-train.vercel.app/api/v1`

**Authentication:** `Authorization: Bearer <api_key>` (hashed, workspace-scoped)

**Endpoints:**
- `POST /posts` — create a post
- `GET /posts` — list posts (paginated)
- `GET /posts/{id}` — post details
- `POST /social-accounts` — list connected accounts
- `GET /analytics/{id}` — post metrics

See [docs/api/page.tsx](app/%28marketing%29/docs/api/page.tsx) for schema.

### MCP Integration

Post Train exposes an MCP server for use with Claude and other AI agents. See `convex/_generated/ai/` for available functions.

---

## Content Studio (Video Generation)

All three templates render locally via ffmpeg. AI generations are delegated to external providers.

### Grid Template
```
Input: 4 video clips (any resolution)
Process: Normalize → stack 2×2 → sync audio to longest
Output: 1080×1920 vertical video
Cost: Free (local CPU)
```

### Fade-in Template
```
Input: 1 clip + caption text (≤200 chars)
Process: Render caption to PNG (canvas) → composite with fade filter
Output: 1080×1920 vertical video
Cost: Free (local CPU)
```

### AI UGC Creator
```
Input: Script (≤600 chars) + persona (stock or upload image)
Process: 
  - Stock: Creatify API → talking-head video
  - Custom: fal.ai (image → TTS → Kling AI Avatar v2)
Output: 1080×1920 vertical video (30-60s)
Cost: ~$0 (Creatify paid plan) or ~$1.70 per 30s (fal.ai pay-as-you-go)
```

Monthly cap: **30 AI generations/month** per workspace (flat rate). Grid/fade-in uncapped.

---

## Environment Variables

**Required for production:**
| Variable | Purpose | Example |
|----------|---------|---------|
| `PT_SECRET` | Sessions + credential encryption | (64-hex from `openssl rand -hex 32`) |
| `CONVEX_DEPLOYMENT_NAME` | Convex project URL | `basic-mole-538` |
| `NEXT_PUBLIC_APP_URL` | Webhook + OAuth redirects | `https://yourdomain.com` |

**OAuth (for testing):**
| Variable | Platform |
|----------|----------|
| `GOOGLE_CLIENT_ID` / `SECRET` | Google sign-in |
| `LINKEDIN_CLIENT_ID` / `SECRET` | LinkedIn OAuth |
| `TWITTER_CLIENT_ID` / `SECRET` | Twitter/X OAuth |

**Stripe:**
| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | Billing API key |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Client-side key |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing |
| `STRIPE_PRICE_*` | Product price IDs (8 total) |

**Email (Brevo):**
| Variable | Purpose |
|----------|---------|
| `BREVO_API_KEY` | Transactional email API |
| `EMAIL_FROM` / `EMAIL_FROM_NAME` | Sender address |

**Media (Cloudflare R2):**
| Variable | Purpose |
|----------|---------|
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 API key ID |
| `R2_SECRET_ACCESS_KEY` | R2 API key secret |
| `R2_BUCKET` | Bucket name |

**Video Generation (Optional):**
| Variable | Purpose |
|----------|---------|
| `CREATIFY_API_ID` / `API_KEY` | Stock UGC personas |
| `FAL_KEY` | Custom persona AI |
| `STUDIO_MOCK` | Force mock mode (`1`) |

**Background Worker (Render):**
| Variable | Purpose |
|----------|---------|
| `WORKER_ENABLED` | Enable worker (`1` on Render, absent on Vercel) |
| `CRON_SECRET` | Pinger authentication |

Full docs: [docs/PRODUCTION.md](docs/PRODUCTION.md).

---

## Testing

### Mock Mode
By default, all OAuth flows and video generation providers run in mock mode — no API keys needed.

```bash
# Force mock mode (overrides real keys if present)
STUDIO_MOCK=1 pnpm dev
```

### Connect a Real Account
1. Set `GOOGLE_CLIENT_ID` + `SECRET` in `.env.local`
2. Start the dev server
3. Sign in with Google
4. Navigate to Settings → Connections → Connect [Platform]
5. You'll be redirected to the real OAuth provider (if keys are set)

---

## Contributing

This is a personal project. For questions or suggestions, reach out via email.

---

## License

MIT

---

## Support

- **Docs:** [/docs](docs/)
- **Status:** [docs/TODO.md](docs/TODO.md)
- **Email:** ehleedev@gmail.com

---

**Built with care.** Optimized for speed, security, and user delight.
