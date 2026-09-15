# KAI Voice Agent — Master Product Requirements Document

**Version:** 1.0
**Audience:** Developer / LLM Build Specification
**Frontend:** Next.js + TypeScript
**Primary AI:** Gemini API
**Blockchain:** Avalanche
**Wallet:** MetaMask / Core Wallet
**Payments:** Avalanche x402 + M-Pesa
**Middleware:** Kite AI
**Optional Harness:** TrueForge, where required
**Memory:** RAG
**Identity:** DID-based authorization
**Execution:** Human-in-the-loop approval

**Purpose:** Give another LLM a precise implementation blueprint for building KAI as a voice-first agent platform capable of orchestrating blockchain, payments, DeFi, conservation data, NFTs, escrow, memory, and authorized actions.

---

## 1. Product Vision

KAI is a voice-first AI financial and conservation agent. Users should be able to speak naturally and ask KAI to retrieve information, record structured data, interact with ecosystem tools, prepare blockchain transactions, initiate M-Pesa payments, purchase or sell conservation NFTs, and manage escrow workflows.

Examples include:
- "Swap 10 AVAX for Y Token."
- "What is the best APY available?"
- "I planted 45 trees today."
- "Buy a conservation NFT for KSh 500 using M-Pesa."
- "Hold this payment in escrow until the NFT is delivered."

**Core principle:** the AI is an orchestration and assistant layer. It does not replace the user's wallet or smart contracts.

---

## 2. Core Architecture

```
USER (VOICE / TEXT)
        |
        v
NEXT.JS FRONTEND
        |
        v
AGENT ORCHESTRATOR (Gemini + agent runtime)
        |
   +----+----+----------------+
   |         |                |
   v         v                v
Kite AI    RAG          DID / POLICY
Tooling   Memory        Authorization
   |         |                |
   +---------+----------------+
             |
             v
       TOOL REGISTRY
             |
   +---------+-----------+-----------+
   |         |           |           |
   v         v           v           v
Avalanche/  M-Pesa   Conservation  DeFi/NFT/Escrow
x402        Daraja    JSON/Data
             |
             v
   METAMASK / CORE — HUMAN SIGNATURE
             |
             v
        AVALANCHE
```

---

## 3. AI Model

Use the Gemini API as the primary reasoning model for:
- Natural-language understanding
- Intent detection
- Planning
- Tool selection and tool arguments
- Conversation
- RAG question answering
- Voice responses

Gemini must **not** have unrestricted blockchain signing authority. It should call registered tools. Sensitive financial actions must pass through authorization and human wallet approval.

---

## 4. Voice Interface

Support:
- Microphone input
- Speech-to-text
- Text input
- Streamed responses where practical
- Natural voice output
- Transaction status updates
- Approval prompts

**Example:** User says "Swap 10 AVAX for Y Token." KAI explains the route and transaction, asks for approval, opens MetaMask/Core, monitors the transaction, and reports confirmation.

---

## 5. Multi-Agent Architecture

Use a supervisor plus specialized agents rather than one unrestricted agent.

- **Supervisor Agent** — understands the request, selects specialists, maintains context, and coordinates workflows.
- **DeFi Agent** — balances, swaps, prices, APYs, protocol information, transaction preparation.
- **Avalanche Agent** — Avalanche balances, ERC-20/ERC-721 operations, x402, contract calls, escrow and transaction monitoring.
- **Conservation Agent** — conservation activity, user JSON, verification status, impact records.
- **Payment Agent** — x402 and M-Pesa payment workflows.
- **NFT Agent** — conservation NFT discovery, minting, transfers, purchases and sales.
- **Escrow Agent** — escrow creation, state monitoring, condition evaluation and release workflow.

---

## 6. Kite AI Middleware

Use Kite AI as the middleware/tooling layer where appropriate so Gemini interacts with registered ecosystem tools through controlled interfaces.

**Middleware responsibilities:** tool discovery, schemas, input validation, execution, response normalization, safe retries, authentication and logging.

**Rule:** only explicitly registered tools may be called; never allow arbitrary tool execution.

---

## 7. TrueForge Harness

Where an agent harness/runtime is needed, integrate TrueForge around the agent execution layer. Use it for controlled execution, state, permissions, observability, retries and execution boundaries where its capabilities fit.

If a required capability is not provided, implement the missing control in KAI's own runtime instead of forcing the dependency.

---

## 8. DID Identity Layer

Give the KAI agent a decentralized identity mechanism. The DID represents the agent's authorized identity and can be associated with capabilities, policies, signatures/verifications and audit records.

> **Important:** a DID is not a license for unrestricted financial control. The user's wallet remains the authority for transactions requiring a human signature.

---

## 9. Permission Model

Use capability-based permissions.

```json
{
  "agent": "did:...",
  "permissions": [
    "read_balance",
    "read_apy",
    "read_conservation_data",
    "prepare_swap",
    "prepare_x402_payment",
    "manage_escrow"
  ],
  "requires_human_approval": [
    "swap",
    "x402_payment",
    "nft_purchase",
    "nft_sale",
    "escrow_release"
  ]
}
```

---

## 10. Human Approval & Wallet

Financial transactions must not execute silently. The normal path is:

```
user request → agent plan → policy check → human approval →
MetaMask/Core signature → Avalanche → transaction monitoring
```

- Never request or store a user's seed phrase.
- Do not give Gemini unrestricted signing access.
- Do not make the agent's private key the user's financial authority.

---

## 11. Gas Model

Do not implement an agent-pays-gas feature in the initial version. The user's MetaMask/Core wallet should pay Avalanche network gas and provide the transaction signature. Gas sponsorship or account abstraction can be a later feature.

---

## 12. x402 Agent

The x402 agent should:
1. Inspect payment requirements
2. Identify amount and recipient
3. Validate authorization
4. Prepare the transaction
5. Request human approval
6. Submit through the wallet
7. Monitor confirmation
8. Report settlement

Never fabricate payment status. Verify settlement independently from the blockchain or a trusted payment response.

---

## 13. Escrow System

Escrow is a first-class KAI feature. The smart contract holds funds and enforces settlement. The AI agent manages the workflow and monitors conditions.

The agent can:
- Create escrow
- Inspect state
- Monitor x402/payment/NFT events
- Evaluate predefined conditions
- Request or trigger permitted release
- Notify the user

**Security rule:** the agent must not have arbitrary power to redirect escrowed assets. Contract rules and authorization policies must constrain release.

---

## 14. Escrow Example

> User: "Buy this conservation NFT and hold the payment until the NFT reaches my wallet."

```
Create escrow
  → funds locked in contract
  → M-Pesa/payment confirmed
  → NFT mint/transfer
  → agent monitors Avalanche
  → NFT arrives
  → condition satisfied
  → release request / required approval
  → contract releases funds
  → settlement confirmed
```

---

## 15. Conservation Agent & User JSON

Allow users to report activities such as tree planting. Store structured JSON with activity, quantity, date, user reference and verification status.

Do not treat a user claim as verified impact automatically. Use explicit states such as `USER_REPORTED`, `VERIFIED` and `REJECTED`.

```json
{
  "activity": "tree_planting",
  "quantity": 45,
  "date": "2026-09-16",
  "verification_status": "pending"
}
```

---

## 16. RAG Memory

Implement RAG for long-term conversational context. Store conversation chunks, embeddings and metadata, then retrieve relevant context for Gemini.

Keep authoritative financial and blockchain state in transactional databases or live blockchain queries. Do not use vector memory as the source of truth for balances, transaction status or ownership.

---

## 17. M-Pesa Conservation NFT — Buy

End-to-end flow:

```
Voice/text request
  → Gemini
  → NFT Agent
  → M-Pesa tool
  → STK Push
  → user confirms on phone
  → callback received and verified
  → Avalanche NFT transaction prepared
  → wallet approval if required
  → transaction submitted
  → blockchain monitored
  → NFT ownership confirmed
  → user notified
  → transaction stored
```

---

## 18. M-Pesa Conservation NFT — Sell

Recommended escrow-based flow:

```
Seller requests sale
  → verify NFT ownership
  → identify buyer/payment
  → create escrow
  → asset/payment locked as applicable
  → payment confirmed
  → delivery/settlement conditions checked
  → settlement
  → seller receives funds
```

---

## 19. Tool Registry

Create a centralized typed tool registry. Initial tools should include:

- `get_wallet_balance`
- `get_token_balance`
- `get_token_price`
- `get_apy`
- `compare_apy`
- `prepare_swap`
- `get_x402_quote`
- `prepare_x402_payment`
- `send_x402_payment`
- `get_transaction`
- `monitor_transaction`
- `create_escrow`
- `get_escrow`
- `check_escrow_conditions`
- `request_escrow_release`
- `record_conservation_activity`
- `get_conservation_activity`
- `query_user_data`
- `get_nft`
- `mint_nft`
- `transfer_nft`
- `create_mpesa_payment`
- `check_mpesa_payment`
- `search_memory`
- `save_memory`

---

## 20. Tool-Calling Rules

- Gemini must never invent tool results.
- Current APYs must come from current tool data.
- Transaction status must come from transaction queries.
- Wallet balances must come from wallet/blockchain queries.
- User records must come from the appropriate data store.
- Validate all tool arguments before execution.

---

## 21. Transaction State Machine

Use explicit states:

```
REQUESTED → PLANNED → AWAITING_APPROVAL → APPROVED → SUBMITTED → CONFIRMING → CONFIRMED
```

Failure/cancellation states: `REJECTED`, `CANCELLED`, `FAILED`, `EXPIRED`.

---

## 22. Frontend UX

Build a clean voice/chat interface with:
- A prominent microphone control
- Conversation history
- Tool/transaction status
- Wallet connection
- Approval cards
- M-Pesa status
- NFT information
- Escrow status

Approval UI should clearly show: chain, asset, amount, recipient/contract, estimated gas, slippage or relevant limits, and what the user is approving.

---

## 23. Suggested Next.js Structure

```
app/
  api/
    agent/
    voice/
    x402/
    mpesa/
    escrow/
    conservation/
    transactions/
  agents/
    supervisor/
    defi/
    avalanche/
    conservation/
    escrow/
    payments/
    nft/
  tools/
    avalanche/
    x402/
    kite/
    mpesa/
    escrow/
    conservation/
    rag/
  lib/
    gemini/
    did/
    wallet/
    database/
    permissions/
    logging/
  components/
    voice/
    chat/
    approval/
    wallet/
    transactions/
    escrow/
```

---

## 24. Security Requirements

**Never:**
- Request seed phrases
- Give Gemini unrestricted signing authority
- Allow arbitrary contract execution
- Allow arbitrary tool execution
- Invent transaction results
- Directly modify financial balances through the model
- Allow unrestricted high-value escrow release

**Always:**
- Validate inputs, addresses and chain IDs
- Enforce permissions
- Log important actions
- Require wallet signatures for user-authorized transactions
- Show transaction details before signing
- Verify confirmations independently

---

## 25. Observability

Log important agent actions such as:

- `agent_started`
- `tool_called`
- `approval_requested`
- `approval_granted`
- `approval_rejected`
- `transaction_submitted`
- `transaction_confirmed`
- `transaction_failed`
- `escrow_created`
- `escrow_condition_met`
- `escrow_release_requested`
- `escrow_released`
- `mpesa_payment_requested`
- `mpesa_payment_confirmed`

---

## 26. MVP Phases

| Phase | Scope |
|---|---|
| 1 | Next.js + Gemini + voice + basic orchestrator |
| 2 | MetaMask/Core + Avalanche + balances + transaction preparation |
| 3 | Kite AI tool middleware + registry + permissions |
| 4 | x402 payments + approval + monitoring |
| 5 | Conservation data + conservation NFT |
| 6 | M-Pesa Daraja + STK Push + callbacks + NFT purchase |
| 7 | Solidity escrow + monitoring + release workflow |
| 8 | RAG memory |
| 9 | DID authorization |
| 10 | Optimize multi-agent architecture |

---

## 27. Definition of Done

An MVP is complete when a user can say **"KAI, buy me a conservation NFT for KSh 500 using M-Pesa,"** and the system can understand it, identify the NFT, initiate and verify M-Pesa, prepare the Avalanche transaction, obtain wallet approval when required, monitor the chain, confirm ownership, store the transaction and later answer questions using authoritative transaction data.

Also verify: **"Swap 10 AVAX for Y Token"** through quote → preparation → approval → wallet → Avalanche → monitoring → confirmation.

Also verify: **"Put this transaction in escrow until the NFT is delivered"** through escrow creation → funds locked → condition monitoring → delivery detection → permitted release → settlement.

---

## 28. Final Engineering Principle

The LLM must preserve this separation:

- **Gemini** = understands and plans
- **Kite AI / tools** = controlled tool access
- **TrueForge** (if used) = execution harness
- **DID / policies** = agent authorization
- **Human** = approves sensitive actions
- **MetaMask / Core** = signs
- **Avalanche** = executes
- **Smart contracts** = enforce ownership/escrow
- **Agent** = monitors and orchestrates
- **RAG** = recalls context, not authoritative financial state
