import { ethers } from "ethers";
import { EAS, SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import type { Application } from "./types";

// EAS contract addresses on Base Sepolia (canonical, public)
const EAS_CONTRACT_BASE_SEPOLIA = "0x4200000000000000000000000000000000000021";

// Schema string for ImpactLens attestations.
// The reviewer/script registers this schema once via `npm run register:schema`
// and pastes the UID into EAS_SCHEMA_UID.
export const SCHEMA_STRING =
  "string projectName,string category,string githubUrl,uint16 totalScore,uint8 utility,uint8 innovation,uint8 technical,uint8 credibility,uint8 fraudFlagCount,address recipient";

export type AttestResult = {
  uid: string;
  txHash?: string;
  chain: "base-sepolia";
  mock: boolean;
};

export async function attestApplication(app: Application): Promise<AttestResult> {
  if (app.totalScore === undefined || !app.subScores) {
    throw new Error("Application not evaluated yet — score required.");
  }
  const pk = process.env.EAS_PRIVATE_KEY;
  const rpc = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
  const schemaUid = process.env.EAS_SCHEMA_UID;

  if (!pk || !schemaUid) {
    // Mock attestation — deterministic UID so the demo path still feels real
    // even if no on-chain key is configured. UI labels it as such.
    const mockUid = ethers.keccak256(
      ethers.toUtf8Bytes(`mock:${app.id}:${app.totalScore}:${app.evaluatedAt ?? Date.now()}`)
    );
    return { uid: mockUid, chain: "base-sepolia", mock: true };
  }

  const provider = new ethers.JsonRpcProvider(rpc);
  const signer = new ethers.Wallet(pk, provider);
  const eas = new EAS(EAS_CONTRACT_BASE_SEPOLIA);
  eas.connect(signer);

  const recipient =
    /^0x[a-fA-F0-9]{40}$/.test(app.walletAddress)
      ? app.walletAddress
      : "0x0000000000000000000000000000000000000000";

  const enc = new SchemaEncoder(SCHEMA_STRING);
  const data = enc.encodeData([
    { name: "projectName",   value: app.projectName,                 type: "string" },
    { name: "category",      value: app.category,                    type: "string" },
    { name: "githubUrl",     value: app.githubUrl,                   type: "string" },
    { name: "totalScore",    value: BigInt(app.totalScore),          type: "uint16" },
    { name: "utility",       value: BigInt(app.subScores.utility),    type: "uint8"  },
    { name: "innovation",    value: BigInt(app.subScores.innovation), type: "uint8"  },
    { name: "technical",     value: BigInt(app.subScores.technical),  type: "uint8"  },
    { name: "credibility",   value: BigInt(app.subScores.credibility),type: "uint8"  },
    { name: "fraudFlagCount",value: BigInt(app.fraudFlags?.length ?? 0), type: "uint8" },
    { name: "recipient",     value: recipient,                       type: "address"},
  ]);

  const tx = await eas.attest({
    schema: schemaUid,
    data: {
      recipient,
      expirationTime: 0n,
      revocable: true,
      data,
    },
  });
  const uid = await tx.wait();
  const anyTx = tx as unknown as { tx?: { hash?: string }; receipt?: { hash?: string } };
  const txHash = anyTx?.tx?.hash ?? anyTx?.receipt?.hash;
  return { uid, txHash, chain: "base-sepolia", mock: false };
}
