import { expect, test } from "bun:test"
import { createTestRenderer } from "@opentui/core/testing"
import { IssueCloseConfirmationRenderable } from "./IssueCloseConfirmationRenderable.js"
import type { IssueOption } from "./issueOption.js"

const option: IssueOption = {
  name: "Fix startup crash",
  description: "owner/repo #42",
  value: {
    repository: "owner/repo",
    issue: {
      html_url: "https://github.com/owner/repo/issues/42",
      number: 42,
      title: "Fix startup crash",
      state: "open",
      repository_url: "https://api.github.com/repos/owner/repo",
      updated_at: "2026-07-17T00:00:00Z",
      labels: [],
      body: null,
      user: { login: "alice" },
    },
  },
}

test("confirms with y and cancels with escape", async () => {
  const { renderer, mockInput, renderOnce, captureCharFrame } = await createTestRenderer({ width: 70, height: 10 })
  const confirmed: IssueOption[] = []
  let cancelled = 0

  try {
    const confirmation = new IssueCloseConfirmationRenderable(renderer, {
      id: "issue-close-confirmation-test",
      width: "100%",
      height: "100%",
      onConfirm: (selected) => confirmed.push(selected),
      onCancel: () => cancelled++,
    })
    renderer.root.add(confirmation)

    confirmation.open(option)
    await renderOnce()
    expect(captureCharFrame()).toContain("Close issue?")
    expect(captureCharFrame()).toContain("owner/repo #42")

    mockInput.pressKey("y")
    expect(confirmed).toEqual([option])
    expect(confirmation.visible).toBe(true)

    confirmation.open(option)
    mockInput.pressEscape()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(cancelled).toBe(1)
    expect(confirmation.visible).toBe(false)
  } finally {
    renderer.destroy()
  }
})
