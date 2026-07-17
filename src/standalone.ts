import packageJson from "../package.json" with { type: "json" }

const help = `muster ${packageJson.version}

TUI for managing GitHub issues.

Usage:
  muster              Start the TUI
  muster -v, --version
                      Print the installed version
  muster -h, --help   Show this help message
`

const command = Bun.argv[2]

if (command === "-h" || command === "--help" || command === "help") {
  console.log(help)
  process.exit(0)
}

if (command === "-v" || command === "--version" || command === "version") {
  console.log(packageJson.version)
  process.exit(0)
}

if (command === "--self-test") {
  await import("./app/main.js")
  console.log(packageJson.version)
  process.exit(0)
}

if (command) {
  console.error(`Unknown command: ${command}`)
  console.error("Run `muster --help` for usage.")
  process.exit(1)
}

await import("./index.js")
