// Minimal ABI surface used by the frontend & action layer. Mirrors the public
// signatures of contracts/PersonaNFT.sol — no need to ship full artifact json.
export const PersonaNFTAbi = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "uri", type: "string" },
      { name: "slug", type: "string" },
      { name: "constHash", type: "string" },
      {
        name: "contribs",
        type: "tuple[]",
        components: [
          { name: "wallet", type: "address" },
          { name: "shareBps", type: "uint96" },
        ],
      },
    ],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    type: "function",
    name: "tip",
    stateMutability: "payable",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "event",
    name: "PersonaMinted",
    inputs: [
      { indexed: true, name: "tokenId", type: "uint256" },
      { indexed: true, name: "owner", type: "address" },
      { indexed: false, name: "slug", type: "string" },
      { indexed: false, name: "uri", type: "string" },
    ],
  },
] as const;
