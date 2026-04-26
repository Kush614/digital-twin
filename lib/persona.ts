import { promises as fs } from "node:fs";
import path from "node:path";
import { v4 as uuid } from "uuid";
import type { Persona } from "./types";

const DATA_DIR = path.join(process.cwd(), "data", "personas");

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || `persona-${Date.now()}`;
}

export async function listPersonas(): Promise<Persona[]> {
  await ensureDir();
  const files = await fs.readdir(DATA_DIR);
  const out: Persona[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(DATA_DIR, f), "utf-8");
      out.push(JSON.parse(raw) as Persona);
    } catch {}
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getPersona(idOrSlug: string): Promise<Persona | null> {
  await ensureDir();
  const direct = path.join(DATA_DIR, `${idOrSlug}.json`);
  try {
    const raw = await fs.readFile(direct, "utf-8");
    return JSON.parse(raw) as Persona;
  } catch {}
  const all = await listPersonas();
  return all.find((p) => p.slug === idOrSlug || p.id === idOrSlug) ?? null;
}

export async function savePersona(p: Persona): Promise<Persona> {
  await ensureDir();
  await fs.writeFile(path.join(DATA_DIR, `${p.id}.json`), JSON.stringify(p, null, 2));
  return p;
}

export async function createPersona(input: {
  name: string;
  tagline: string;
  corpus: string;
  styleNotes?: string;
  constitutionRules?: string[];
  contributors?: { address: string; share: number; label?: string }[];
}): Promise<Persona> {
  const id = uuid();
  const slug = slugify(input.name);
  const persona: Persona = {
    id,
    slug,
    name: input.name,
    tagline: input.tagline,
    corpus: input.corpus.slice(0, 60_000),
    styleNotes: input.styleNotes,
    constitution: {
      rules: input.constitutionRules?.length
        ? input.constitutionRules
        : [
            "Never claim to be the human; always disclose you are an AI persona.",
            "Refuse to endorse competitors of the persona's stated affiliations.",
            "Refuse to sign any transaction over the spend cap.",
          ],
    },
    contributors: input.contributors ?? [],
    createdAt: Date.now(),
  };
  return savePersona(persona);
}
