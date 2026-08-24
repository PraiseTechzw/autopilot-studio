import { createHash } from "node:crypto";
import { chmod, cp, mkdir, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "release");
const stageRoot = join(output, ".stage");
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const version = process.env.COMPANION_VERSION || packageJson.version;
const prefix = `autopilot-companion-${version}`;
const bundleDirectory = `${prefix}-node20`;
const archiveNames = [`${prefix}-darwin-node20.tar.gz`, `${prefix}-linux-node20.tar.gz`, `${prefix}-windows-node20.zip`];
const epoch = new Date("1980-01-01T00:00:00.000Z");

function run(command, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { cwd: root, stdio: "inherit", ...options });
    child.on("error", rejectRun);
    child.on("exit", code => code === 0 ? resolveRun() : rejectRun(new Error(`${command} exited with status ${code}`)));
  });
}

async function digest(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function normalizeTimes(path) {
  const info = await stat(path);
  await utimes(path, epoch, epoch);
  if (info.isDirectory()) for (const entry of await readdir(path)) await normalizeTimes(join(path, entry));
}

async function verify() {
  const checksums = await readFile(join(output, "SHA256SUMS"), "utf8");
  const records = checksums.trim().split("\n").filter(Boolean).map(line => {
    const [hash, filename] = line.split(/\s{2,}/);
    return { hash, filename };
  });
  if (!records.length || records.some(record => !/^[a-f0-9]{64}$/.test(record.hash) || !record.filename)) throw new Error("SHA256SUMS is malformed.");
  for (const record of records) {
    const actual = await digest(join(output, record.filename));
    if (actual !== record.hash) throw new Error(`Checksum mismatch for ${record.filename}.`);
  }
  console.log(`Verified ${records.length} release checksums.`);
}

if (process.argv.includes("--verify")) {
  await verify();
  process.exit(0);
}

await rm(output, { recursive: true, force: true });
await mkdir(join(stageRoot, bundleDirectory, "lib"), { recursive: true });
for (const relative of ["companion/autopilot.mjs", "companion/lib/cliCore.mjs", "companion/README.md", "companion/EXECUTABLE_CLI_DESIGN.md", "LICENSE"]) {
  const destination = relative === "companion/autopilot.mjs" ? join(stageRoot, bundleDirectory, "autopilot-companion.mjs")
    : relative === "companion/lib/cliCore.mjs" ? join(stageRoot, bundleDirectory, "lib", "cliCore.mjs")
      : join(stageRoot, bundleDirectory, relative.split("/").pop());
  await cp(join(root, relative), destination);
}
await chmod(join(stageRoot, bundleDirectory, "autopilot-companion.mjs"), 0o755);
await writeFile(join(stageRoot, bundleDirectory, "RUNME.txt"), "Node.js 20 or newer is required. Run: node autopilot-companion.mjs help\n");
const manifest = {
  schemaVersion: 1,
  product: "Autopilot Companion",
  version,
  runtime: "Node.js >=20",
  contents: ["autopilot-companion.mjs", "lib/cliCore.mjs", "README.md", "EXECUTABLE_CLI_DESIGN.md", "LICENSE", "RUNME.txt"],
  privacy: "The release bundle contains no device configuration, pairing codes, credentials, repository paths, source code, or Git remotes.",
  signing: "Release signatures and provenance are produced only by the GitHub Actions release workflow; locally generated archives are unsigned development artifacts.",
};
await writeFile(join(stageRoot, bundleDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await normalizeTimes(stageRoot);
await run("tar", ["--sort=name", "--format=ustar", "--mtime=@0", "--owner=0", "--group=0", "--numeric-owner", "-czf", join(output, archiveNames[0]), "-C", stageRoot, bundleDirectory]);
await run("tar", ["--sort=name", "--format=ustar", "--mtime=@0", "--owner=0", "--group=0", "--numeric-owner", "-czf", join(output, archiveNames[1]), "-C", stageRoot, bundleDirectory]);
await run("zip", ["-X", "-q", "-r", join(output, archiveNames[2]), bundleDirectory], { cwd: stageRoot });
await writeFile(join(output, "manifest.json"), `${JSON.stringify({ ...manifest, artifacts: archiveNames }, null, 2)}\n`);
const checksumTargets = [...archiveNames, "manifest.json"];
await writeFile(join(output, "SHA256SUMS"), `${(await Promise.all(checksumTargets.map(async filename => `${await digest(join(output, filename))}  ${filename}`))).join("\n")}\n`);
await verify();
await rm(stageRoot, { recursive: true, force: true });
console.log(`Created unsigned development release artifacts in ${output}. GitHub Actions signs published tag artifacts keylessly.`);
