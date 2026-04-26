export type Contributor = {
  address: string;
  share: number; // basis points, 10000 = 100%
  label?: string;
};

export type Constitution = {
  rules: string[];
  spendCapWei?: string;
  allowedDaos?: string[];
};

export type Persona = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  ownerAddress?: string;
  voiceId?: string;
  avatarId?: string;
  corpus: string;
  styleNotes?: string;
  constitution: Constitution;
  contributors: Contributor[];
  tokenId?: number;
  txHash?: string;
  createdAt: number;
};

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};
