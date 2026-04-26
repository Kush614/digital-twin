"use client";

import { useState } from "react";
import { createWalletClient, custom, createPublicClient, http, decodeEventLog } from "viem";
import { sepolia } from "viem/chains";
import { PersonaNFTAbi } from "@/lib/contractAbi";

type Props = {
  personaId: string;
  initialTokenId: number | null;
  initialTxHash: string | null;
};

const NFT_ADDR = process.env.NEXT_PUBLIC_PERSONA_NFT_ADDRESS as `0x${string}` | undefined;

export default function MintPanel({ personaId, initialTokenId, initialTxHash }: Props) {
  const [tokenId, setTokenId] = useState<number | null>(initialTokenId);
  const [txHash, setTxHash] = useState<string | null>(initialTxHash);
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function mint() {
    setBusy(true);
    setStatus("");
    try {
      if (!NFT_ADDR) throw new Error("NEXT_PUBLIC_PERSONA_NFT_ADDRESS not set — run npm run deploy:contract first.");
      const eth = (typeof window !== "undefined" ? (window as any).ethereum : null);
      if (!eth) throw new Error("No browser wallet found. Install MetaMask.");

      const [account] = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      const wallet = createWalletClient({ chain: sepolia, transport: custom(eth) });
      const pub = createPublicClient({ chain: sepolia, transport: http() });

      // Persona metadata pointer — public route returns the persona JSON
      const uri = `${window.location.origin}/api/personas/${personaId}`;
      const slug = personaId;
      const constHash = "0x" + "0".repeat(64); // placeholder — would be IPFS CID in prod

      setStatus("Awaiting wallet signature…");
      const hash = await wallet.writeContract({
        account: account as `0x${string}`,
        address: NFT_ADDR,
        abi: PersonaNFTAbi,
        functionName: "mint",
        args: [account as `0x${string}`, uri, slug, constHash, []],
      });
      setTxHash(hash);
      setStatus("Mining…");
      const receipt = await pub.waitForTransactionReceipt({ hash });

      let mintedId: number | null = null;
      for (const log of receipt.logs) {
        try {
          const ev = decodeEventLog({ abi: PersonaNFTAbi, data: log.data, topics: log.topics });
          if (ev.eventName === "PersonaMinted") {
            mintedId = Number((ev.args as any).tokenId);
            break;
          }
        } catch {}
      }
      setTokenId(mintedId);
      setStatus(`Minted token #${mintedId} ✓`);

      await fetch(`/api/personas/${personaId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tokenId: mintedId, txHash: hash, ownerAddress: account }),
      });
    } catch (e: any) {
      setStatus(`✗ ${e?.shortMessage ?? e?.message ?? "mint failed"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">On-chain ownership</h2>
        <span className="tag">Sepolia</span>
      </div>
      <p className="text-xs text-white/50 mb-3">
        Mint this persona as an NFT. Each token records its constitution hash and a list of
        contributor royalty splits — every tip is paid out on-chain to the wallets that
        helped train the persona.
      </p>
      <button className="btn" onClick={mint} disabled={busy}>
        {busy ? "Minting…" : tokenId !== null ? "Re-mint" : "Mint persona"}
      </button>
      {tokenId !== null && (
        <div className="mt-3 text-xs text-white/70 space-y-1 font-mono">
          <div>token #{tokenId}</div>
          {txHash && (
            <div className="truncate">
              tx:{" "}
              <a
                className="text-accent2 underline"
                href={`https://sepolia.etherscan.io/tx/${txHash}`}
                target="_blank"
              >
                {txHash}
              </a>
            </div>
          )}
        </div>
      )}
      {status && <div className="mt-2 text-xs text-white/60">{status}</div>}
      {!NFT_ADDR && (
        <div className="mt-3 text-[11px] text-warn">
          Contract not deployed yet. Set <code>SEPOLIA_RPC_URL</code> +{" "}
          <code>DEPLOYER_PRIVATE_KEY</code> in .env.local and run{" "}
          <code className="font-mono">npm run deploy:contract</code>.
        </div>
      )}
    </div>
  );
}
