/**
 * src/lib/agent/executeSchema.ts
 *
 * Client-side executor for human-approved agent plans.
 *
 * This is the "send_*" half of the tool registry: prepare_* returns a plan,
 * the human approves it on the voice/chat UI, and these functions then build
 * + submit the real transaction through the connected wallet (MetaMask/Core).
 *
 * The agent never moves funds itself. Every call here happens ONLY after a
 * human pressed Approve and then signed in their wallet.
 */

import { encodeFunctionData, keccak256, parseUnits, stringToHex } from 'viem';
import { ERC20_ABI } from '@/lib/erc20abi';
import { ESCROW_ABI, KAI_ORCHESTRATOR_ADDRESS, KAI_ORCHESTRATOR_DID } from '@/lib/agent/escrowAbi';
import { AMM_ABI } from '@/lib/defiAbis';
import { ESCROW_ADDRESS, AMM_ADDRESS, TOKENS, TREASURY } from '@/lib/addresses';
import { ECOSYSTEM_TOKENS } from '@/lib/tokens';

type RequestTxResult = { txHash: string; explorer: string };

interface EthereumRequest {
  selectedAddress?: string;
  request: (args: { method: string; params: unknown[] }) => Promise<unknown>;
}

/**
 * Minimal eth_sendTransaction wrapper — resolves the tx hash. Relies on the
 * wallet provider already being on Fuji (voice page switches the chain).
 */
async function requestTx(to: string, data: string, value = '0x0'): Promise<RequestTxResult> {
  const ethereum = (window as unknown as { ethereum?: EthereumRequest }).ethereum;
  if (!ethereum) throw new Error('No wallet detected.');
  if (!ethereum.selectedAddress) throw new Error('No account selected in the wallet.');
  const txHash = (await ethereum.request({
    method: 'eth_sendTransaction',
    params: [{ from: ethereum.selectedAddress, to, data, value }],
  })) as string;
  return { txHash, explorer: `https://testnet.snowtrace.io/tx/${txHash}` };
}

function isAddr(v?: string | null): v is `0x${string}` {
  return !!v && /^0x[a-fA-F0-9]{40}$/.test(v);
}

/** Resolve a token symbol to its ERC-20 address (frontend mirror). */
function tokenAddress(symbol: string): `0x${string}` | null {
  const sym = symbol.toUpperCase();
  if (sym === 'AVAX') return null;
  const fromTickers = ECOSYSTEM_TOKENS.find((t) => t.symbol === sym)?.address;
  if (isAddr(fromTickers)) return fromTickers;
  const fromTokens = TOKENS[sym];
  if (isAddr(fromTokens)) return fromTokens;
  for (const [k, v] of Object.entries(TOKENS)) {
    if (k.toUpperCase() === sym && isAddr(v)) return v;
  }
  return null;
}

/**
 * executeSwap — send_swap (requires prior human approval).
 *
 * Approves the AMM to spend `fromToken` then calls KaiAMM.swap().
 */
export async function executeSwap(args: {
  fromToken: string;
  fromAmount: number | string;
  toToken: string;
  fromAddress?: string;
}): Promise<RequestTxResult> {
  const fromSym = (args.fromToken || '').toUpperCase();
  const toSym = (args.toToken || '').toUpperCase();
  if (!AMM_ADDRESS) throw new Error('KAI AMM is not configured on this network.');
  if (fromSym === toSym) throw new Error('Cannot swap a token for itself.');
  if (fromSym === 'AVAX') throw new Error('AVAX-native swaps are not wired yet — use yBOB/NVR/yTOKEN/KAI pairs.');

  const tokenIn = tokenAddress(fromSym);
  if (!tokenIn) throw new Error(`Unknown sell token: ${fromSym}`);
  const tokenOut = tokenAddress(toSym);
  if (!tokenOut) throw new Error(`Unknown receive token: ${toSym}`);

  const amtIn = parseUnits(String(args.fromAmount), 18);
  // Reference-price-based minimum output with ~1% slippage buffer.
  const minOut = (amtIn * 99n) / 100n;

  // 1. Approve AMM to pull tokens.
  await requestTx(
    tokenIn,
    encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [AMM_ADDRESS, amtIn] }),
  );

  // 2. Execute the swap.
  return requestTx(
    AMM_ADDRESS,
    encodeFunctionData({
      abi: AMM_ABI,
      functionName: 'swap',
      args: [tokenIn, tokenOut, amtIn, minOut],
    }),
  );
}

/**
 * executeEscrowCreate — create_escrow (requires prior human approval).
 *
 * 1. Approve escrow contract to pull the settlement token (yBOB).
 * 2. escrow.deposit(paymentRef, provider, agent, token, amount, autoReleaseSec, serviceDesc).
 */
export async function executeEscrowCreate(args: {
  purpose: string;
  amountToken: number | string;
  token?: string;
  provider?: string;
}): Promise<RequestTxResult> {
  if (!ESCROW_ADDRESS) throw new Error('KaiEscrow is not configured on this network.');
  const tokenSym = (args.token || 'yBOB').toUpperCase();
  const token = tokenAddress(tokenSym);
  if (!token) throw new Error(`Unknown settlement token: ${tokenSym}`);

  const provider = isAddr(args.provider) ? args.provider! : TREASURY;
  if (!provider) throw new Error('Escrow provider not set (no treasury configured).');

  const amount = parseUnits(String(args.amountToken), 18);
  const autoReleaseSec = 7n * 24n * 3600n; // 7 days
  const paymentRef = keccak256(stringToHex(`x402:${args.purpose || 'agent-payment'}`));
  const serviceDesc = (args.purpose || 'KAI agent payment').slice(0, 120);

  // 1. Approve escrow to pull yBOB.
  await requestTx(
    token,
    encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [ESCROW_ADDRESS, amount] }),
  );

  // 2. Lock funds in escrow.
  return requestTx(
    ESCROW_ADDRESS,
    encodeFunctionData({
      abi: ESCROW_ABI,
      functionName: 'deposit',
      args: [
        paymentRef,
        provider,
        KAI_ORCHESTRATOR_ADDRESS,
        token,
        amount,
        autoReleaseSec,
        serviceDesc,
      ],
    }),
  );
}

/**
 * executeEscrowRelease — request_escrow_release (requires prior human approval).
 *
 * Calls KaiEscrow.release(escrowId). The agent can NEVER release unilaterally;
 * this only runs after the human approves and signs.
 */
export async function executeEscrowRelease(escrowId: string): Promise<RequestTxResult> {
  if (!ESCROW_ADDRESS) throw new Error('KaiEscrow is not configured on this network.');
  const raw = escrowId.replace(/^0x/, '');
  if (raw.length !== 64) throw new Error('Invalid escrowId (expected 64 hex chars).');
  const id = `0x${raw}` as `0x${string}`;
  return requestTx(
    ESCROW_ADDRESS,
    encodeFunctionData({ abi: ESCROW_ABI, functionName: 'release', args: [id] }),
  );
}

export const AGENT_DID = KAI_ORCHESTRATOR_DID;

/** Snowtrace helper used by the voice page to deep-link results. */
export function snowtraceLink(type: 'tx' | 'address', hash: string): string {
  return `https://testnet.snowtrace.io/${type}/${hash}`;
}