import { promises as fs } from "node:fs";
import path from "node:path";
import { v4 as uuid } from "uuid";
import type { Application } from "./types";

const DIR = path.join(process.cwd(), "data", "applications");

async function ensure() {
  await fs.mkdir(DIR, { recursive: true });
}

export function slugify(input: string) {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || `app-${Date.now()}`
  );
}

export async function listApplications(): Promise<Application[]> {
  await ensure();
  const files = await fs.readdir(DIR);
  const out: Application[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    try {
      out.push(JSON.parse(await fs.readFile(path.join(DIR, f), "utf-8")));
    } catch {}
  }
  return out.sort(
    (a, b) =>
      (b.totalScore ?? -1) - (a.totalScore ?? -1) || b.createdAt - a.createdAt
  );
}

export async function getApplication(idOrSlug: string): Promise<Application | null> {
  await ensure();
  const direct = path.join(DIR, `${idOrSlug}.json`);
  try {
    return JSON.parse(await fs.readFile(direct, "utf-8")) as Application;
  } catch {}
  const all = await listApplications();
  return all.find((a) => a.slug === idOrSlug || a.id === idOrSlug) ?? null;
}

export async function saveApplication(a: Application): Promise<Application> {
  await ensure();
  await fs.writeFile(path.join(DIR, `${a.id}.json`), JSON.stringify(a, null, 2));
  return a;
}

export async function createApplication(input: {
  projectName: string;
  category: string;
  walletAddress: string;
  githubUrl: string;
  pitch: string;
  inputMode: Application["inputMode"];
}): Promise<Application> {
  const id = uuid();
  const slug = slugify(input.projectName);
  const app: Application = {
    id,
    slug,
    projectName: input.projectName,
    category: input.category,
    walletAddress: input.walletAddress,
    githubUrl: input.githubUrl,
    pitch: input.pitch,
    inputMode: input.inputMode,
    createdAt: Date.now(),
  };
  return saveApplication(app);
}
