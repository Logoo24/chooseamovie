#!/usr/bin/env node

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const notesPath = resolve(process.cwd(), "DEV_NOTES.md");
if (!existsSync(notesPath)) process.exit(0);

let commitRaw = "";
try {
  commitRaw = execSync('git log -1 --date=short --pretty=format:"%H|%ad|%s"', {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
} catch {
  process.exit(0);
}

if (!commitRaw) process.exit(0);

const [fullHash, date, subject] = commitRaw.split("|");
if (!fullHash || !date || !subject) process.exit(0);

const text = readFileSync(notesPath, "utf8");
if (text.includes(fullHash) || text.includes(fullHash.slice(0, 7))) process.exit(0);

const entry = [
  `### ${date} - ${subject} (\`${fullHash.slice(0, 7)}\`)`,
  "- Update summary pending.",
  "",
].join("\n");

const sectionHeader = "## Recent commits log";
const sectionStart = text.indexOf(sectionHeader);

if (sectionStart === -1) {
  const next = `${text.trimEnd()}\n\n${sectionHeader}\n${entry}`;
  writeFileSync(notesPath, `${next}\n`, "utf8");
  process.exit(0);
}

const bodyStart = text.indexOf("\n", sectionStart) + 1;
const nextSectionIndex = text.indexOf("\n## ", bodyStart);
const bodyEnd = nextSectionIndex === -1 ? text.length : nextSectionIndex;

const before = text.slice(0, bodyStart);
const currentBody = text.slice(bodyStart, bodyEnd).trimStart();
const after = text.slice(bodyEnd);

const updatedBody = `${entry}${currentBody}`;
writeFileSync(notesPath, `${before}${updatedBody}${after}`, "utf8");
