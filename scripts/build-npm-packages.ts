import { chmod, cp, mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
  binaryPackageName,
  currentReleaseTargetId,
  findReleaseTarget,
  releaseTargets,
  type ReleaseTarget,
} from "./release-targets.js"

const root = process.cwd()
const rootPackage = (await Bun.file(join(root, "package.json")).json()) as {
  readonly name: string
  readonly version: string
  readonly description: string
  readonly license: string
  readonly repository: { readonly type: string; readonly url: string }
  readonly bugs: { readonly url: string }
  readonly homepage: string
  readonly keywords: ReadonlyArray<string>
  readonly engines: { readonly node: string }
}
const outDir = join(root, "dist", "npm")
const requested = process.argv[2]

const run = (command: ReadonlyArray<string>): void => {
  const process = Bun.spawnSync({ cmd: [...command], cwd: root, stdout: "inherit", stderr: "inherit" })
  if (process.exitCode !== 0) throw new Error(`Command failed (${process.exitCode}): ${command.join(" ")}`)
}

const selectedTargets = (): ReadonlyArray<ReleaseTarget> => {
  if (requested === "main") return []
  if (requested === "all") return releaseTargets

  const targetId = requested ?? currentReleaseTargetId()
  const target = findReleaseTarget(targetId)
  if (!target) throw new Error(`Unsupported npm binary target: ${targetId ?? "unknown"}`)
  return [target]
}

const writeJson = (path: string, value: unknown): Promise<void> =>
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`)

const buildBinaryPackage = async (target: ReleaseTarget): Promise<void> => {
  const packageDir = join(outDir, "binaries", target.id)
  const binDir = join(packageDir, "bin")
  const binaryPath = join(binDir, "muster")

  await rm(packageDir, { recursive: true, force: true })
  await mkdir(binDir, { recursive: true })
  run([
    "bun",
    "build",
    "--compile",
    "--format=esm",
    `--target=${target.bunTarget}`,
    `--outfile=${binaryPath}`,
    "src/standalone.ts",
  ])
  await chmod(binaryPath, 0o755)
  await cp(join(root, "LICENSE"), join(packageDir, "LICENSE"))
  await writeFile(
    join(packageDir, "SOURCE.md"),
    `Corresponding source for ${rootPackage.name} ${rootPackage.version}:\n${rootPackage.homepage.replace(/#readme$/, "")}/tree/v${rootPackage.version}\n`,
  )
  await writeJson(join(packageDir, "package.json"), {
    name: binaryPackageName(rootPackage.name, target),
    version: rootPackage.version,
    description: `${rootPackage.description} (${target.id} binary)`,
    license: rootPackage.license,
    repository: rootPackage.repository,
    bugs: rootPackage.bugs,
    homepage: rootPackage.homepage,
    os: [target.os],
    cpu: [target.cpu],
    ...(target.os === "linux" ? { libc: ["glibc"] } : {}),
    files: ["bin", "LICENSE", "SOURCE.md"],
    publishConfig: {
      access: "public",
      provenance: true,
      registry: "https://registry.npmjs.org/",
    },
  })

  if (target.id === currentReleaseTargetId()) {
    const smoke = Bun.spawnSync({ cmd: [binaryPath, "--self-test"], cwd: root, stdout: "pipe", stderr: "pipe" })
    if (smoke.exitCode !== 0 || smoke.stdout.toString().trim() !== rootPackage.version) {
      throw new Error(`Binary smoke failed for ${target.id}: ${smoke.stderr.toString()}`)
    }
  }
}

const buildMainPackage = async (): Promise<void> => {
  const packageDir = join(outDir, "main")
  await rm(packageDir, { recursive: true, force: true })
  await mkdir(join(packageDir, "bin"), { recursive: true })
  await cp(join(root, "bin", "muster.js"), join(packageDir, "bin", "muster.js"))
  await chmod(join(packageDir, "bin", "muster.js"), 0o755)
  await cp(join(root, "README.md"), join(packageDir, "README.md"))
  await cp(join(root, "LICENSE"), join(packageDir, "LICENSE"))
  await writeFile(
    join(packageDir, "SOURCE.md"),
    `Corresponding source for ${rootPackage.name} ${rootPackage.version}:\n${rootPackage.homepage.replace(/#readme$/, "")}/tree/v${rootPackage.version}\n`,
  )
  await writeJson(join(packageDir, "package.json"), {
    name: rootPackage.name,
    version: rootPackage.version,
    description: rootPackage.description,
    type: "module",
    license: rootPackage.license,
    repository: rootPackage.repository,
    bugs: rootPackage.bugs,
    homepage: rootPackage.homepage,
    keywords: rootPackage.keywords,
    engines: rootPackage.engines,
    bin: { muster: "bin/muster.js" },
    files: ["bin", "README.md", "LICENSE", "SOURCE.md"],
    optionalDependencies: Object.fromEntries(
      releaseTargets.map((target) => [binaryPackageName(rootPackage.name, target), rootPackage.version]),
    ),
    publishConfig: {
      access: "public",
      provenance: true,
      registry: "https://registry.npmjs.org/",
    },
  })
}

if (requested === undefined) await rm(outDir, { recursive: true, force: true })
for (const target of selectedTargets()) await buildBinaryPackage(target)
if (requested === undefined || requested === "main") await buildMainPackage()
