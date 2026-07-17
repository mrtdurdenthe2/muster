import { addDefaultParsers, parseColor, SyntaxStyle, type FiletypeParserOptions } from "@opentui/core"
import { theme } from "./theme.js"

const commonParsers: FiletypeParserOptions[] = [
  {
    filetype: "python",
    aliases: ["py"],
    wasm: "https://github.com/tree-sitter/tree-sitter-python/releases/download/v0.23.6/tree-sitter-python.wasm",
    queries: {
      highlights: ["https://github.com/tree-sitter/tree-sitter-python/raw/refs/heads/master/queries/highlights.scm"],
    },
  },
  {
    filetype: "rust",
    aliases: ["rs"],
    wasm: "https://github.com/tree-sitter/tree-sitter-rust/releases/download/v0.24.0/tree-sitter-rust.wasm",
    queries: {
      highlights: ["https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/refs/heads/master/queries/rust/highlights.scm"],
    },
  },
  {
    filetype: "go",
    wasm: "https://github.com/tree-sitter/tree-sitter-go/releases/download/v0.25.0/tree-sitter-go.wasm",
    queries: {
      highlights: ["https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/refs/heads/master/queries/go/highlights.scm"],
    },
  },
  {
    filetype: "bash",
    aliases: ["sh", "shell", "zsh"],
    wasm: "https://github.com/tree-sitter/tree-sitter-bash/releases/download/v0.25.0/tree-sitter-bash.wasm",
    queries: {
      highlights: ["https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/refs/heads/master/queries/bash/highlights.scm"],
    },
  },
  {
    filetype: "json",
    aliases: ["jsonc"],
    wasm: "https://github.com/tree-sitter/tree-sitter-json/releases/download/v0.24.8/tree-sitter-json.wasm",
    queries: {
      highlights: ["https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/refs/heads/master/queries/json/highlights.scm"],
    },
  },
  {
    filetype: "yaml",
    aliases: ["yml"],
    wasm: "https://github.com/tree-sitter-grammars/tree-sitter-yaml/releases/download/v0.7.2/tree-sitter-yaml.wasm",
    queries: {
      highlights: ["https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/refs/heads/master/queries/yaml/highlights.scm"],
    },
  },
  {
    filetype: "c",
    aliases: ["h"],
    wasm: "https://github.com/tree-sitter/tree-sitter-c/releases/download/v0.24.1/tree-sitter-c.wasm",
    queries: {
      highlights: ["https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/refs/heads/master/queries/c/highlights.scm"],
    },
  },
  {
    filetype: "cpp",
    aliases: ["c++", "cc", "cxx", "hpp"],
    wasm: "https://github.com/tree-sitter/tree-sitter-cpp/releases/download/v0.23.4/tree-sitter-cpp.wasm",
    queries: {
      highlights: ["https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/refs/heads/master/queries/cpp/highlights.scm"],
    },
  },
  {
    filetype: "java",
    wasm: "https://github.com/tree-sitter/tree-sitter-java/releases/download/v0.23.5/tree-sitter-java.wasm",
    queries: {
      highlights: ["https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/refs/heads/master/queries/java/highlights.scm"],
    },
  },
  {
    filetype: "nix",
    wasm: "https://github.com/ast-grep/ast-grep.github.io/raw/40b84530640aa83a0d34a20a2b0623d7b8e5ea97/website/public/parsers/tree-sitter-nix.wasm",
    queries: {
      highlights: ["https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/refs/heads/master/queries/nix/highlights.scm"],
    },
  },
]

export const issueSyntaxStyle = SyntaxStyle.fromStyles({
  default: { fg: parseColor(theme.text) },
  keyword: { fg: parseColor("#ff7b72"), bold: true },
  "keyword.import": { fg: parseColor("#ff7b72"), bold: true },
  "keyword.operator": { fg: parseColor("#ff7b72") },
  string: { fg: parseColor("#a5d6ff") },
  comment: { fg: parseColor(theme.textSubtle), italic: true },
  number: { fg: parseColor("#79c0ff") },
  boolean: { fg: parseColor("#79c0ff") },
  constant: { fg: parseColor("#79c0ff") },
  function: { fg: parseColor("#d2a8ff") },
  "function.call": { fg: parseColor("#d2a8ff") },
  type: { fg: parseColor("#ffa657") },
  constructor: { fg: parseColor("#ffa657") },
  variable: { fg: parseColor(theme.text) },
  property: { fg: parseColor("#79c0ff") },
  operator: { fg: parseColor("#ff7b72") },
  punctuation: { fg: parseColor(theme.textMuted) },
  "punctuation.bracket": { fg: parseColor(theme.textMuted) },
  "punctuation.delimiter": { fg: parseColor(theme.textMuted) },
  "markup.heading": { fg: parseColor(theme.blueText), bold: true },
  "markup.heading.1": { fg: parseColor(theme.blueText), bold: true },
  "markup.heading.2": { fg: parseColor(theme.blueText), bold: true },
  "markup.strong": { fg: parseColor(theme.text), bold: true },
  "markup.bold": { fg: parseColor(theme.text), bold: true },
  "markup.italic": { fg: parseColor(theme.textMuted), italic: true },
  "markup.list": { fg: parseColor(theme.blueText) },
  "markup.quote": { fg: parseColor(theme.textMuted), italic: true },
  "markup.raw": { fg: parseColor("#a5d6ff"), bg: parseColor(theme.surfaceRaised) },
  "markup.raw.block": { fg: parseColor("#a5d6ff"), bg: parseColor(theme.surfaceRaised) },
  "markup.raw.inline": { fg: parseColor("#a5d6ff"), bg: parseColor(theme.surfaceRaised) },
  "markup.link": { fg: parseColor(theme.blueText), underline: true },
  "markup.link.label": { fg: parseColor(theme.blueText), underline: true },
  "markup.link.url": { fg: parseColor(theme.blueText), underline: true },
  conceal: { fg: parseColor(theme.textSubtle) },
})

let parsersRegistered = false

export const registerIssueSyntaxParsers = (): void => {
  if (parsersRegistered) return
  parsersRegistered = true
  addDefaultParsers(commonParsers)
}
