import { TokenConfig } from './tokens';

/**
 * Prompt MetaMask or any EIP-747 compatible wallet to add the token to the asset list.
 */
export async function importTokenToMetaMask(token: TokenConfig): Promise<boolean> {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('MetaMask or Web3 wallet is not detected.');
  }

  if (!token.address) {
    throw new Error(`Token ${token.symbol} is not deployed on this network.`);
  }

  try {
    const wasAdded = await (window as any).ethereum.request({
      method: 'wallet_watchAsset',
      params: {
        type: 'ERC20',
        options: {
          address: token.address,
          symbol: token.symbol,
          decimals: token.decimals,
          image: `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanchec/info/logo.png`,
        },
      },
    });

    return !!wasAdded;
  } catch (error: any) {
    console.error('Failed to add token to MetaMask:', error);
    throw error;
  }
}

/**
 * Call the testnet faucet to mint tokens directly to the user's wallet address.
 */
export async function requestFaucetTokens(recipient: string, symbol: string, amount = 100) {
  const res = await fetch('/api/faucet/mint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient, symbol, amount }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to mint tokens');
  }

  return data;
}
