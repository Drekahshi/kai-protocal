import { http, createConfig } from 'wagmi';
import type { CreateConnectorFn } from '@wagmi/core';
import { avalancheFuji, avalanche } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';
import { kaiPrivateKeyConnector } from './kai-private-key-connector';

const fujiRpc = process.env.NEXT_PUBLIC_AVAX_RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc';

const kaiPrivateKey = process.env.NEXT_PUBLIC_KAI_PRIVATE_KEY?.trim();
const kaiConnectors: CreateConnectorFn[] = kaiPrivateKey
  ? ([kaiPrivateKeyConnector({
      privateKey: `0x${kaiPrivateKey.replace(/^0x/, '')}`,
    })] as CreateConnectorFn[])
  : [];

export const config = createConfig({
  chains: [avalancheFuji, avalanche],
  connectors: [
    ...kaiConnectors,
    injected({
      target: 'metaMask',
    }),
    injected({
      target: {
        id: 'core',
        name: 'Core Wallet',
        provider(window) {
          const win = window as Window & {
            avalanche?: { request?: unknown; isCore?: boolean };
            avax?: { request?: unknown; isCore?: boolean };
            ethereum?: { request?: unknown; isCore?: boolean };
          };
          const provider = win.avalanche?.request
            ? win.avalanche
            : win.avax?.request
              ? win.avax
              : win.ethereum?.isCore
                ? win.ethereum
                : undefined;
          return provider as never;
        },
      },
    }),
  ],
  ssr: true,
  transports: {
    [avalancheFuji.id]: http(fujiRpc),
    [avalanche.id]: http(),
  },
});
