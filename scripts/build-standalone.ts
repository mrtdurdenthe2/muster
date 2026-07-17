import { chmod, mkdir, rm } from "node:fs/promises"
import { join } from "node:path"
import { currentReleaseTargetId, findReleaseTarget } from "./release-targets.js"

const root = process.cwd()
const requestedTargetId = process.argv[2] ?? currentReleaseTargetId()
const target = findReleaseTarget(requestedTargetId)
if (!target) throw new Error(`Unsupported standalone target: ${requestedTargetId ?? "unknown"}`)

const outDir = join(root, "dist", "standalone", target.id)
const binaryPath = join(outDir, "muster")
await rm(outDir, { recursive: true, force: true })
await mkdir(outDir, { recursive: true })

const buildProcess = Bun.spawnSync({
  cmd: [
    "bun",
    "build",
    "--compile",
    "--format=esm",
    `--target=${target.bunTarget}`,
    `--outfile=${binaryPath}`,
    "src/standalone.ts",
  ],
  cwd: root,
  stdout: "inherit",
  stderr: "inherit",
})
if (buildProcess.exitCode !== 0) throw new Error(`Standalone build failed for ${target.id}`)
await chmod(binaryPath, 0o755)
