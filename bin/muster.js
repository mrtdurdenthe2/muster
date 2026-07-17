#!/usr/bin/env node

import childProcess from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const filename = fileURLToPath(import.meta.url)
const requireFromHere = createRequire(import.meta.url)
const packageJson = requireFromHere("../package.json")
const sourceEntry = path.join(path.dirname(fs.realpathSync(filename)), "..", "src", "standalone.ts")

const platformMap = {
  darwin: "darwin",
  linux: "linux",
}

const archMap = {
  arm64: "arm64",
  x64: "x64",
}

const help = `muster ${packageJson.version}

TUI for managing GitHub issues.

Usage:
  muster              Start the TUI
  muster -v, --version
                      Print the installed version
  muster -h, --help   Show this help message
`

const run = (target, args = process.argv.slice(2)) => {
  const result = childProcess.spawnSync(target, args, { stdio: "inherit" })
  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }
  process.exit(typeof result.status === "number" ? result.status : 1)
}

if (process.env.MUSTER_BIN_PATH) run(process.env.MUSTER_BIN_PATH)

if (process.argv[2] === "-h" || process.argv[2] === "--help" || process.argv[2] === "help") {
  console.log(help)
  process.exit(0)
}

if (process.argv[2] === "-v" || process.argv[2] === "--version" || process.argv[2] === "version") {
  console.log(packageJson.version)
  process.exit(0)
}

const platform = platformMap[os.platform()]
const arch = archMap[os.arch()]

const runSourceIfAvailable = () => {
  if (fs.existsSync(sourceEntry)) run("bun", [sourceEntry, ...process.argv.slice(2)])
}

const isMusl = () => {
  if (os.platform() !== "linux") return false
  try {
    if (fs.existsSync("/etc/alpine-release")) return true
  } catch {}
  try {
    const result = childProcess.spawnSync("ldd", ["--version"], { encoding: "utf8" })
    return `${result.stdout ?? ""}${result.stderr ?? ""}`.toLowerCase().includes("musl")
  } catch {
    return false
  }
}

if (!platform || !arch) {
  runSourceIfAvailable()
  console.error(`Unsupported platform for ${packageJson.name}: ${os.platform()}-${os.arch()}`)
  process.exit(1)
}

if (platform === "linux" && isMusl()) {
  runSourceIfAvailable()
  console.error(`${packageJson.name} does not publish musl Linux binaries yet.`)
  console.error("Use a glibc-based Linux distribution or run the source checkout with Bun.")
  process.exit(1)
}

const packageName = `${packageJson.name}-${platform}-${arch}`

const resolveBinary = () => {
  try {
    const packageJsonPath = requireFromHere.resolve(`${packageName}/package.json`)
    return path.join(path.dirname(packageJsonPath), "bin", "muster")
  } catch {
    return null
  }
}

const binaryPath = resolveBinary()
if (binaryPath && fs.existsSync(binaryPath)) run(binaryPath)

runSourceIfAvailable()

console.error(`Could not find the ${packageName} binary package for this platform.`)
console.error(`Try reinstalling ${packageJson.name}, or install ${packageName} manually.`)
process.exit(1)
