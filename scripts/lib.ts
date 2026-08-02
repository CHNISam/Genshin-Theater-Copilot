import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, "..");
export const DRAFT_DIR = resolve(ROOT, "seasons/drafts");
export const PUBLISHED_DIR = resolve(ROOT, "seasons/published");
export const TASK_DIR = resolve(ROOT, "seasons/tasks");

export function parseArgs(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, ...rest] = arg.slice(2).split("=");
    if (!key) continue;
    out[key] = rest.length > 0 ? rest.join("=") : true;
  }
  return out;
}

export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function writeText(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value, "utf8");
}

export function draftPath(seasonId: string): string {
  return resolve(DRAFT_DIR, `${seasonId}.draft.json`);
}

export function publishedPath(seasonId: string): string {
  return resolve(PUBLISHED_DIR, `${seasonId}.json`);
}

export function taskPath(seasonId: string): string {
  return resolve(TASK_DIR, `${seasonId}.task.md`);
}

export function fileExists(path: string): boolean {
  return existsSync(path);
}

export function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}
