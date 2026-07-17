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
  expect(issueMatchesSearch(option, "@alice")).toBe(true)
  expect(issueMatchesSearch(option, "42")).toBe(true)
  expect(issueMatchesSearch(option, "#42")).toBe(true)
  expect(issueMatchesSearch(option, "#4")).toBe(false)
  expect(issueMatchesSearch(option, "type:bug")).toBe(true)
  expect(issueMatchesSearch(option, "author:alice tag:priority")).toBe(true)
  expect(issueMatchesSearch(option, "name:alice")).toBe(false)
})

test("slash search filters the issue list and escape clears it", async () => {
  const { renderer, mockInput, renderOnce, captureCharFrame } = await createTestRenderer({
    width: 60,
    height: 12,
  })

  try {
    const list = new IssueListRenderable(renderer, {
      id: "issue-list-test",
      width: "100%",
      height: "100%",
      onSelectionChange: () => {},
    })
    list.options = [
      issueOption(1, "Fix startup crash", "alice", ["bug"]),
      issueOption(2, "Document configuration", "bob", ["docs"]),
    ]
    renderer.root.add(list)
    list.focus()

    mockInput.pressKey("/")
    await mockInput.typeText("author:alice")
    await renderOnce()

    expect(list.searching).toBe(true)
    expect(list.options.map((option) => option.value.issue.number)).toEqual([1])
    expect(captureCharFrame()).toContain("1/2")

    mockInput.pressEnter()
    await renderOnce()
    expect(list.searching).toBe(false)

    mockInput.pressEscape()
    await new Promise((resolve) => setTimeout(resolve, 20))
    await renderOnce()
    expect(list.options).toHaveLength(2)
    expect(captureCharFrame()).not.toContain("author:alice")
  } finally {
    renderer.destroy()
  }
})
