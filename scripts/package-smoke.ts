import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { binaryPackageName, currentReleaseTargetId, findReleaseTarget } from "./release-targets.js"

const root = process.cwd()
const rootPackage = (await Bun.file(join(root, "package.json")).json()) as { name: string; version: string }
const targetId = currentReleaseTargetId()
const target = findReleaseTarget(targetId)
if (!target) throw new Error(`Unsupported package smoke platform: ${process.platform}-${process.arch}`)

const run = (command: ReadonlyArray<string>, cwd: string): string => {
  const process = Bun.spawnSync({ cmd: [...command], cwd, stdout: "pipe", stderr: "pipe" })
  if (process.exitCode !== 0) {
    throw new Error(`Command failed (${process.exitCode}): ${command.join(" ")}\n${process.stdout}${process.stderr}`)
  }
  return process.stdout.toString()
}

const tempRoot = await mkdtemp(join(tmpdir(), "muster-package-smoke-"))
try {
  const packDir = join(tempRoot, "pack")
  const installDir = join(tempRoot, "install")
  await Promise.all([mkdir(packDir, { recursive: true }), mkdir(installDir, { recursive: true })])
  await writeFile(join(installDir, "package.json"), '{"private":true}\n')

  run(["bun", "run", "build:npm-packages"], root)

  const pack = (directory: string): string => {
    const output = run(["npm", "pack", "--pack-destination", packDir], directory).trim().split("\n")
    const filename = output.at(-1)
    if (!filename?.endsWith(".tgz")) throw new Error(`Could not determine npm tarball from ${directory}`)
    return join(packDir, filename)
  }

  const binaryTarball = pack(join(root, "dist", "npm", "binaries", target.id))
  const mainTarball = pack(join(root, "dist", "npm", "main"))
  run(["npm", "install", binaryTarball, mainTarball], installDir)

  const installedPackage = JSON.parse(
    await readFile(join(installDir, "node_modules", "@kaiwlsn", "muster", "package.json"), "utf8"),
  ) as { version: string; optionalDependencies?: Record<string, string> }
  const expectedBinaryPackage = binaryPackageName(rootPackage.name, target)
  if (installedPackage.version !== rootPackage.version) throw new Error("Installed main package version is incorrect")
  if (installedPackage.optionalDependencies?.[expectedBinaryPackage] !== rootPackage.version) {
    throw new Error(`Installed main package does not reference ${expectedBinaryPackage}`)
  }

  const version = run([join(installDir, "node_modules", ".bin", "muster"), "--version"], installDir).trim()
  if (version !== rootPackage.version) throw new Error(`Expected muster ${rootPackage.version}, got ${version}`)
  const selfTest = run([join(installDir, "node_modules", ".bin", "muster"), "--self-test"], installDir).trim()
  if (selfTest !== rootPackage.version) throw new Error(`Installed native payload self-test failed: ${selfTest}`)
} finally {
  await rm(tempRoot, { recursive: true, force: true })
}
