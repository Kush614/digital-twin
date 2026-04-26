#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import solc from "solc";
import { createWalletClient, createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const root = process.cwd();
const src = readFileSync(path.join(root, "contracts", "PersonaNFT.sol"), "utf-8");

const input = {
  language: "Solidity",
  sources: { "PersonaNFT.sol": { content: src } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};

console.log("Compiling PersonaNFT.sol …");
const out = JSON.parse(solc.compile(JSON.stringify(input)));
if (out.errors) {
  for (const e of out.errors) {
    if (e.severity === "error") {
      console.error(e.formattedMessage);
      process.exit(1);
    } else {
      console.warn(e.formattedMessage);
    }
  }
}
const artifact = out.contracts["PersonaNFT.sol"]["PersonaNFT"];
const abi = artifact.abi;
const bytecode = "0x" + artifact.evm.bytecode.object;

mkdirSync(path.join(root, "artifacts"), { recursive: true });
writeFileSync(path.join(root, "artifacts", "PersonaNFT.json"), JSON.stringify({ abi, bytecode }, null, 2));
console.log("✓ wrote artifacts/PersonaNFT.json");

const rpc = process.env.SEPOLIA_RPC_URL;
const pk = process.env.DEPLOYER_PRIVATE_KEY;
if (!rpc || !pk) {
  console.log("(skipping deploy — set SEPOLIA_RPC_URL and DEPLOYER_PRIVATE_KEY to deploy)");
  process.exit(0);
}

const account = privateKeyToAccount(pk.startsWith("0x") ? pk : "0x" + pk);
const wallet = createWalletClient({ account, chain: sepolia, transport: http(rpc) });
const publicClient = createPublicClient({ chain: sepolia, transport: http(rpc) });

console.log("Deploying from", account.address, "to Sepolia …");
const hash = await wallet.deployContract({ abi, bytecode, args: [] });
console.log("tx hash:", hash);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log("✓ deployed at", receipt.contractAddress);
console.log("\nSet in .env.local:");
console.log(`PERSONA_NFT_ADDRESS=${receipt.contractAddress}`);
console.log(`NEXT_PUBLIC_PERSONA_NFT_ADDRESS=${receipt.contractAddress}`);
