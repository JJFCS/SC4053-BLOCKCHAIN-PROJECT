import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const stamp = new Date().toISOString().replaceAll(":", "-");
const directory = path.resolve(root, `../docs/evidence/validation-${stamp}`);
const source = (await readFile(path.join(root, "contracts/DomainRegistrar.sol"), "utf8")).replaceAll("\r\n", "\n");
let gitRevision = null;
try { gitRevision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); } catch {}
const summary = {
  recordedAt: new Date().toISOString(), node: process.version, platform: process.platform,
  gitRevision, sourceBaseRevision: "cb1f3c4b5bbc04326804089d30991dc69c6a2f60",
  contractSourceSha256: createHash("sha256").update(source).digest("hex"), checks: [],
};
await mkdir(directory, { recursive: true });
const commands = [
  ["build", "node_modules/hardhat/dist/src/cli.js", "build"],
  ["export-abi", "scripts/export-registrar-abi.mjs"],
  ["typecheck", "node_modules/typescript/bin/tsc", "--noEmit"],
  ["tests", "node_modules/hardhat/dist/src/cli.js", "test"],
];
for (const [name, script, ...args] of commands) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(process.execPath, [path.join(root, script), ...args], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const exitCode = result.status ?? 1;
  const output = (result.stdout ?? "") + (result.stderr ?? "") + (result.error ? `\n${result.error}` : "");
  await writeFile(path.join(directory, `${name}.log`), output);
  summary.checks.push({ name, command: ["node", script, ...args], startedAt, endedAt: new Date().toISOString(), exitCode });
  console.log(output);
  await writeFile(path.join(directory, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  if (exitCode !== 0) { console.error(`${name} failed. Evidence: ${directory}`); process.exitCode = exitCode; break; }
}
console.log(`Validation evidence: ${directory}`);
