export type InputMode = "voice" | "text" | "symbol" | "gesture" | "gaze" | "image";

export type VisionEvidence = {
  source: "upload" | "screen" | "camera";
  description: string;        // what the model sees
  claimsVisible: string[];    // discrete claims that can be cross-checked vs. pitch
  technicalSignals: string[]; // signals usable by the technical sub-score (UI polish, framework hints)
  syntheticConfidence: number; // 0..1; >= 0.6 trips a fraud flag
  rawModel?: string;
  fetchedAt: number;
};

export type SubScores = {
  utility: number;       // 0–25
  innovation: number;    // 0–25
  technical: number;     // 0–25
  credibility: number;   // 0–25
};

export type EvaluationRationale = {
  utility: string;
  innovation: string;
  technical: string;
  credibility: string;
};

export type FraudFlag = {
  kind:
    | "ai-generated-pitch"
    | "star-spike"
    | "ghost-repo"
    | "thin-contributor-graph"
    | "recycled-project"
    | "synthetic-image"
    | "duplicate-face";
  severity: "low" | "medium" | "high";
  detail: string;
};

export type FaceDescriptor = {
  // Orientation-normalised feature vector (cosine-comparable). Length is stable
  // across versions of FaceLandmarker as long as STABLE_LANDMARKS doesn't change.
  vector: number[];
  livenessChecks: { blink: boolean; turn: boolean };
  capturedAt: number;
};

export type GitHubFingerprint = {
  repoUrl: string;
  owner: string;
  name: string;
  ageDays: number;
  stars: number;
  watchers: number;
  forks: number;
  openIssues: number;
  closedIssues: number;
  contributors: number;
  commitsLast90d: number;
  commitsTotal: number;
  daysWithCommitsLast90d: number;
  pullRequestsLast90d: number;
  starsLast30d: number;
  topLanguages: string[];
  fetchedAt: number;
  // Sub-scores derived from the above (each 0–25, contribute to "technical")
  velocityScore: number;
  contributorScore: number;
  engagementScore: number;
  starHealthScore: number;
};

export type Application = {
  id: string;
  slug: string;
  projectName: string;
  category: string;
  walletAddress: string;
  githubUrl: string;
  pitch: string;
  inputMode: InputMode;
  visionEvidence?: VisionEvidence;
  faceDescriptor?: FaceDescriptor;
  fingerprint?: GitHubFingerprint;
  subScores?: SubScores;
  totalScore?: number;
  rationale?: EvaluationRationale;
  fraudFlags?: FraudFlag[];
  attestationUid?: string;
  attestationTxHash?: string;
  attestationChain?: "base-sepolia" | "sepolia";
  evaluatedAt?: number;
  createdAt: number;
};
