import { expect, test } from "bun:test"
import { createTestRenderer } from "@opentui/core/testing"
import { IssueListRenderable } from "./IssueListRenderable.js"
import { type IssueOption, issueMatchesSearch } from "./issueOption.js"

const issueOption = (
  number: number,
  title: string,
  author: string,
  labels: ReadonlyArray<string>,
): IssueOption => ({
  name: title,
  description: `owner/repo #${number}`,
  value: {
    repository: "owner/repo",
    issue: {
      html_url: `https://github.com/owner/repo/issues/${number}`,
      number,
      title,
      state: "open",
      repository_url: "https://api.github.com/repos/owner/repo",
      updated_at: "2026-07-17T00:00:00Z",
      labels: labels.map((name) => ({ name, color: "" })),
      body: null,
      user: { login: author },
    },
  },
})

test("matches issue title, author, exact number, and tags", () => {
  const option = issueOption(42, "Fix startup crash", "Alice", ["type:bug", "priority:high"])

  expect(issueMatchesSearch(option, "startup")).toBe(true)
  expect(issueMatchesSearch(option, "start")).toBe(false)
  expect(issueMatchesSearch(option, "@alice")).toBe(true)
  expect(issueMatchesSearch(option, "42")).toBe(true)
  expect(issueMatchesSearch(option, "#42")).toBe(true)
  expect(issueMatchesSearch(option, "#4")).toBe(false)
  expect(issueMatchesSearch(option, "type:bug")).toBe(true)
  expect(issueMatchesSearch(option, "author:alice tag:priority:high")).toBe(true)
  expect(issueMatchesSearch(option, "author:ali")).toBe(false)
  expect(issueMatchesSearch(option, "tag:priority")).toBe(false)
  expect(issueMatchesSearch(option, "name:alice")).toBe(false)
})

test("slash search filters the issue list and escape clears it", async () => {
  const { renderer, mockInput, renderOnce, captureCharFrame, captureSpans } = await createTestRenderer({
    width: 60,
    height: 12,
  })
  const searchQueries: string[] = []

  try {
    const list = new IssueListRenderable(renderer, {
      id: "issue-list-test",
      width: "100%",
      height: "100%",
      onSelectionChange: () => {},
      onSearchChange: (query) => searchQueries.push(query),
    })
    list.options = [
      issueOption(1, "Fix startup crash", "alice", ["bug"]),
      issueOption(2, "Document configuration", "bob", ["docs"]),
    ]
    renderer.root.add(list)
    list.focus()
    await renderOnce()

    mockInput.pressKey("/")
    await mockInput.typeText("author:alice")
    await renderOnce()

    expect(list.searching).toBe(true)
    expect(list.options.map((option) => option.value.issue.number)).toEqual([1])
    expect(captureCharFrame()).toContain("1/2")
    expect(captureCharFrame()).toContain(" OPEN ")
    expect(searchQueries.at(-1)).toBe("author:alice")
    const openTag = captureSpans().lines.flatMap((line) => line.spans).find((span) => span.text.includes(" OPEN "))
    expect(openTag?.bg.b).toBeGreaterThan(openTag?.bg.r ?? 1)

    list.issueStateFilter = "closed"
    await renderOnce()
    expect(captureCharFrame()).toContain(" CLOSED ")
    const closedTag = captureSpans().lines.flatMap((line) => line.spans).find((span) => span.text.includes(" CLOSED "))
    expect(closedTag?.bg.r).toBeGreaterThan(closedTag?.bg.b ?? 1)

    mockInput.pressEnter()
    await renderOnce()
    expect(list.searching).toBe(false)

    mockInput.pressEscape()
    await new Promise((resolve) => setTimeout(resolve, 20))
    await renderOnce()
    expect(list.options).toHaveLength(2)
    expect(captureCharFrame()).not.toContain("author:alice")
    expect(searchQueries.at(-1)).toBe("")

    list.options = []
    list.loading = true
    await renderOnce()
    expect(captureCharFrame()).toContain("Loading issues...")
    expect(captureCharFrame()).not.toContain("No matching issues")
  } finally {
    renderer.destroy()
  }
})

test("updates an issue without losing options hidden by local search", async () => {
  const { renderer, mockInput } = await createTestRenderer({ width: 60, height: 12 })

  try {
    const list = new IssueListRenderable(renderer, {
      id: "issue-list-update-test",
      width: "100%",
      height: "100%",
      onSelectionChange: () => {},
    })
    const first = issueOption(1, "Fix startup crash", "alice", ["bug"])
    const second = issueOption(2, "Document configuration", "bob", ["docs"])
    list.options = [first, second]
    renderer.root.add(list)
    list.focus()

    mockInput.pressKey("/")
    await mockInput.typeText("startup")
    expect(list.options).toHaveLength(1)

    list.updateIssueOption(
      { ...first, value: { ...first.value, issue: { ...first.value.issue, state: "closed" } } },
      true,
    )
    mockInput.pressEscape()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(list.options.map((option) => option.value.issue.number)).toEqual([1, 2])
    expect(list.options[0]?.value.issue.state).toBe("closed")

    list.updateIssueOption(first, false)
    expect(list.options.map((option) => option.value.issue.number)).toEqual([2])
  } finally {
    renderer.destroy()
  }
})
