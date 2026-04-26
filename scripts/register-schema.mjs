#!/usr/bin/env node
// One-shot helper: registers the ImpactLens EAS schema on Base Sepolia and
// prints the UID. Paste the printed UID into EAS_SCHEMA_UID in .env.local.

import { ethers } from "ethers";
import {
  SchemaRegistry,
} from "@ethereum-attestation-service/eas-sdk";

const SCHEMA =
  "string projectName,string category,string githubUrl,uint16 totalScore,uint8 utility,uint8 innovation,uint8 technical,uint8 credibility,uint8 fraudFlagCount,address recipient";

// canonical SchemaRegistry on Base Sepolia
const REGISTRY = "0x4200000000000000000000000000000000000020";

const pk = process.env.EAS_PRIVATE_KEY;
const rpc = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
if (!pk) {
  console.error("Set EAS_PRIVATE_KEY (and optionally BASE_SEPOLIA_RPC_URL) in .env.local first.");
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(rpc);
const signer = new ethers.Wallet(pk, provider);
const reg = new SchemaRegistry(REGISTRY);
reg.connect(signer);

console.log("Registering schema on Base Sepolia from", await signer.getAddress(), "…");
const tx = await reg.register({ schema: SCHEMA, resolverAddress: ethers.ZeroAddress, revocable: true });
const uid = await tx.wait();
console.log("\n✓ Schema UID:", uid);
console.log("\nPaste into .env.local:");
console.log(`EAS_SCHEMA_UID=${uid}`);
console.log(`NEXT_PUBLIC_EAS_SCHEMA_UID=${uid}`);
