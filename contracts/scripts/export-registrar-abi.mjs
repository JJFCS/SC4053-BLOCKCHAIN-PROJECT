import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const input = new URL("../artifacts/contracts/DomainRegistrar.sol/DomainRegistrar.json", import.meta.url);
const output = new URL("../abi/DomainRegistrar.json", import.meta.url);

let artifact;
try {
  artifact = JSON.parse(await readFile(input, "utf8"));
} catch (cause) {
  throw new Error("Build the contracts first: npx hardhat build", { cause });
}
if (artifact.contractName !== "DomainRegistrar" || !Array.isArray(artifact.abi)) {
  throw new Error("Expected the compiled DomainRegistrar artifact.");
}
await mkdir(new URL("../abi/", import.meta.url), { recursive: true });
await writeFile(output, JSON.stringify(artifact.abi, null, 2) + "\n", "utf8");
console.log("Exported " + artifact.abi.length + " ABI entries to " + fileURLToPath(output));
