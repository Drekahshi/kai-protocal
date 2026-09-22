<div align="center">

# 🌿 KAI Nuvari — Avalanche DeFi Ecosystem

**Real on-chain AMM, yield vaults, agent rails & an AI copilot — on Avalanche Fuji C-Chain.**

[![Live Demo](https://img.shields.io/badge/LIVE%20DEMO-avax--frontend--seven.vercel.app-10b981?logo=vercel&logoColor=white&style=for-the-badge)](https://avax-frontend-seven.vercel.app/)
[![Network](https://img.shields.io/badge/network-Avalanche%20Fuji-5438ff?logo=avalanche&style=for-the-badge)]()
[![License](https://img.shields.io/badge/license-ISC-6b7280?style=for-the-badge)]()

**Running now → [https://avax-frontend-seven.vercel.app/](https://avax-frontend-seven.vercel.app/)**

</div>

---

## 🧭 What is KAI Nuvari?

KAI Nuvari is a full-stack **open-finance platform** that combines three layers into one product:

| Layer | What it does | Where it lives |
|-------|--------------|----------------|
| 🖥️ **Next.js app** | The whole consumer dApp — vaults, pools, swap, payments, voice assistant | `avax-frontend/` |
| 🕸️ **On-chain AMM & agent rails** | Real ERC-20 swaps, LP pools, yield vaults, escrow & identity contracts | `contracts/` + `ignition/` |
| 🤖 **AI Agent API** | 20+ agent endpoints (RAG chat, portfolio, DIDs, x402 payments, onboarding) | `server.py` (FastAPI + Needle) |

It's built to feel like a **bank + exchange + AI analyst** in one wallet.

---

## ✨ Features

### Frontend (`avax-frontend/`)
- **20+ routes** — Hub, Vaults, Liquidity Pools, Swap, Payments, Voice Agent, Insurance, Pension, SDG, Securities, SME, Avajaz, Chama, NFTs (connft), Profile, Wallet & more
- **Real on-chain AMM** — swap, add/remove liquidity against `KaiAMM` / `KaiPool` on Fuji (wagmi + viem)
- **Interactive liquidity canvas** — physics-driven bubble graph of token pools (drag, hover, tap-to-open)
- **Live pool intelligence** — animated TVL/APY counters, real-time sparkline charts, fee + price-impact breakdowns, slippage guards
- **Privy embedded wallet** — Google login → personal Avalanche wallet with no seed phrase
- **Paystack payments** — off-ramp/on-ramp checkout (KES)
- **Voice-first UX** — KAI voice/orchestrator agent (Gemini) commands the app
- **Postgres persistence** — Neon + Prisma for users, wallets, referrals

### AI Agent API (root, Python)
- `GET /health` — engine + RAG readiness probe
- `POST /chat`, `/stream` — RAG Q&A over the KAI docs/web corpus
- `/needle/complete` · `/needle/stream` · `/needle/intent` — Needle (on-device) LLM inference
- **Specialised agents** — `tx-analyst`, `portfolio`, `audit`, `dao-draft`, `pricing`, `policy`, `codegen`, `summarize`, `pools` (IL risk), `yields`
- **W3C DIDs** — detached identity layer (`/agents/identity/*`)
- **x402 payment rails** — verify + settle payments (`/agents/x402/*`)
- **Escrow & audit log** — on-chain rails for agentic transactions

### Smart Contracts (Solidity)
| Contract | Purpose |
|----------|---------|
| `NuvariToken.sol` | ERC-20 governance / ecosystem token |
| `KaiVault.sol` | Yield vault (deposit / withdraw, share price, APY) |
| `KaiPool.sol` | `x*y=k` constant-product LP pool |
| `KaiAMM.sol` | AMM router + liquidity manager + pool factory registry |
| `KaiEscrow.sol` | On-chain escrow for agent-driven deals |
| `KaiAgentRegistry.sol` | Registry of on-chain agent identities |
| `KAIAirdropVault.sol` | Token airdrop vesting vault |
| `ConservationNFT.sol` | Nature-backed NFT (RWA) |

Each contract ships with `forge-std` Solidity unit tests (`*.t.sol`).

---

## 🛠️ Tech Stack & Languages

### Languages used
| Language | Where |
|----------|-------|
| **TypeScript** | Next.js app, wagmi/viem client code, Hardhat config & scripts |
| **JavaScript (CJS/ESM)** | Hardhat deploy scripts (`deploy-all-fuji.mjs`), ecosystem token deploys |
| **Solidity** | Smart contracts + Foundry-style Solidity tests |
| **Python** | FastAPI backend, Needle agent, vector/RAG indexing |
| **SQL** | Prisma schema → Neon Postgres (`kai_users`, `kai_wallets`, …) |
| **CSS / Tailwind v4** | Design system (`globals.css`), fluid glassmorphism UI |
| **JSON** | Deploy artifacts, ABI definitions, token registries |
| **Markdown** | Docs and onboarding content |

### Key libraries
| Layer | Stack |
|-------|-------|
| **Framework** | Next.js 16 · React 19 · TypeScript |
| **Blockchain** | viem 2 · wagmi 3 · @avalanche-sdk/chainkit · Hardhat 3 |
| **Auth** | Privy (Client + Server SDK) |
| **Data** | Prisma · Neon Postgres |
| **Payments** | Paystack |
| **AI** | cactus-needle (on-device LLM) · Groq (RAG) · Gemini (voice orchestrator) |
| **Styling** | Tailwind CSS 4 · framer-motion · lucide-react |
| **Extras** | zustand state · html5-qrcode QR pay · tanstack/react-query |

---

## 📁 Monorepo Layout

```
.
├── avax-frontend/        # Next.js 16 dApp (deployed on Vercel)
│   ├── src/app/          #   route-based pages (vaults, pools, pay, voice, …)
│   ├── src/components/   #   UI + pools/vaults/operations widgets
│   └── prisma/           #   database schema
├── contracts/            # Solidity contracts + *.t.sol tests
├── ignition/             # Hardhat Ignition deployment modules
├── scripts/              # Deploy / liquidity-seed / balance CLI scripts
├── server.py             # FastAPI AI Agent API (Needle + 20+ endpoints)
├── vector.py             # ChromaDB embedding index build
├── main.py               # Interactive terminal RAG agent
└── hardhat.config.ts     # Hardhat 3 config (Fuji network)
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js 20+**, npm 10+
- **Python 3.11+**
- A **Groq API key** (RAG) and a **Gemini API key** (voice)
- Optional: a Fuji private key + funded wallet for on-chain tx

### 1. Environment

Copy the example env files:

```bash
cp .env.example .env                         # backend + hardhat keys
cp avax-frontend/.env.example avax-frontend/.env.local
```

Then fill in `GROQ_API_KEY`, `GEMINI_API_KEY`, `DATABASE_URL`, `PAYSTACK_SECRET_KEY`, and the `PRIVY_*` keys. **Never commit real keys.**

### 2. Run the AI Agent API (FastAPI)

```bash
python -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m uvicorn server:app --host 127.0.0.1 --port 8000 --reload
```

Verify: `curl http://127.0.0.1:8000/health`

### 3. Run the Next.js app

```bash
npm --prefix avax-frontend install
npm --prefix avax-frontend run dev
```

Open **http://localhost:3000** — the frontend talks to the agent API at `:8000`.

### 4. Deploy contracts (Avalanche Fuji)

```bash
npm run build
npm run deploy:fuji        # core ecosystem tokens/contracts
npx hardhat run scripts/deploy-defi.ts --network fuji
npx hardhat run scripts/seed-liquidity.mjs --network fuji
```

Deployed addresses land in `defi-addresses.json` / `deployedAddresses.json`, which the UI reads automatically.

---

## 🔌 API Surface (backend, `:8000`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/health` | engine + RAG readiness |
| POST | `/chat` `/stream` | RAG Q&A streaming |
| GET  | `/agents/portfolio/{wallet}` | on-chain portfolio snapshot |
| GET  | `/agents/pools/{pool_id}` | pool position analytics |
| POST | `/agents/pools/il` | impermanent-loss calculator |
| POST | `/agents/tx-analyst` | transaction explainer |
| GET  | `/agents/yields` | vault yield rankings |
| GET  | `/agents/identity/did/{did}` | W3C DID resolution |
| GET  | `/agents/rails/log` | agentic audit log |
| … | 20+ total | see `server.py` |

---

## ☁️ Deployment (Vercel)

The frontend is live at:

> ### **https://avax-frontend-seven.vercel.app/**

Deployment is automatic on push to `main` (Git + Vercel integration, `vercel.json` → `framework: "nextjs"`).

> **Note:** the AI Agent API runs locally via `server.py`. For a fully serverless setup, deploy `server.py` to Railway / Render / Cloud Run and set `NEXT_PUBLIC_AGENT_URL` in the frontend.

---

## 🧪 Testing

```bash
npm test                    # Hardhat (compiles + runs Solidity tests)
npx tsc --noEmit            # frontend typecheck
npm --prefix avax-frontend run lint
```

---

## 📄 License

ISC