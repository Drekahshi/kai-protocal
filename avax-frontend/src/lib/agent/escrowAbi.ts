/**
 * src/lib/agent/escrowAbi.ts
 *
 * KaiEscrow ABI + deployed addresses for the KAI Voice Agent / orchestrator.
 * Deployed on Avalanche Fuji (43113).
 *
 * Flow (single-orchestrator, human-approved):
 *   create_escrow   → escrow.deposit(paymentRef, provider, agent, token, amount, autoReleaseSec, serviceDesc)
 *   request_escrow_release → escrow.release(escrowId)   (payer only, or after auto-release)
 *   refund / dispute route errors back to the user.
 */

export const KAI_ESCROW_ADDRESS =
  (process.env.NEXT_PUBLIC_KAI_ESCROW_ADDRESS ||
    '0x04680EF6Ef98C7bD64eC280B4962875b4E14b80E') as `0x${string}`;

export const KAI_AGENT_REGISTRY_ADDRESS =
  (process.env.NEXT_PUBLIC_KAI_AGENT_REGISTRY_ADDRESS ||
    '0x36C42829BF7e48cCF738f0632456ECE63ABEA2ED') as `0x${string}`;

export const KAI_ORCHESTRATOR_DID = 'did:kai:orchestrator-001';

/** On-chain agent address used for escrow deposits (registered in KaiAgentRegistry). */
export const KAI_ORCHESTRATOR_ADDRESS =
  (process.env.NEXT_PUBLIC_KAI_AGENT_ADDRESS ||
    '0xaA9953BAB5de2147cC0c919Ab2ff22d809188514') as `0x${string}`;

export const KAI_AMM_ADDRESS =
  (process.env.NEXT_PUBLIC_KAI_AMM_ADDRESS ||
    '0x1A201396Aa620C12bf54A394a3449d21E6837861') as `0x${string}`;

export const ESCROW_ABI = [
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'paymentRef', type: 'bytes32' },
      { name: 'provider', type: 'address' },
      { name: 'agent', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'autoReleaseSec', type: 'uint256' },
      { name: 'serviceDesc', type: 'string' },
    ],
    outputs: [{ type: 'bytes32' }],
  },
  {
    name: 'release',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'escrowId', type: 'bytes32' }],
    outputs: [],
  },
  {
    name: 'refund',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'escrowId', type: 'bytes32' }],
    outputs: [],
  },
  {
    name: 'dispute',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'escrowId', type: 'bytes32' }],
    outputs: [],
  },
  {
    name: 'getEscrow',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'escrowId', type: 'bytes32' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'escrowId', type: 'bytes32' },
          { name: 'paymentRef', type: 'bytes32' },
          { name: 'payer', type: 'address' },
          { name: 'provider', type: 'address' },
          { name: 'agent', type: 'address' },
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'fee', type: 'uint256' },
          { name: 'lockedAt', type: 'uint256' },
          { name: 'autoReleaseAt', type: 'uint256' },
          { name: 'agentDid', type: 'string' },
          { name: 'serviceDesc', type: 'string' },
          { name: 'status', type: 'uint8' },
        ],
      },
    ],
  },
  {
    name: 'escrowCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  // ── Events ──────────────────────────────────────────────────────────────
  {
    name: 'Deposited',
    type: 'event',
    inputs: [
      { name: 'escrowId', type: 'bytes32', indexed: true },
      { name: 'paymentRef', type: 'bytes32', indexed: true },
      { name: 'payer', type: 'address', indexed: true },
      { name: 'provider', type: 'address' },
      { name: 'agent', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'autoReleaseAt', type: 'uint256' },
    ],
  },
  {
    name: 'Released',
    type: 'event',
    inputs: [
      { name: 'escrowId', type: 'bytes32', indexed: true },
      { name: 'provider', type: 'address', indexed: true },
      { name: 'netAmount', type: 'uint256' },
      { name: 'fee', type: 'uint256' },
    ],
  },
  {
    name: 'Refunded',
    type: 'event',
    inputs: [
      { name: 'escrowId', type: 'bytes32', indexed: true },
      { name: 'payer', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256' },
    ],
  },
] as const;