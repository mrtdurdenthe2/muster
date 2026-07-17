import { expect, test } from "bun:test"
import { createTestRenderer } from "@opentui/core/testing"
import { IssueDetailsRenderable } from "./IssueDetailsRenderable.js"
import { type IssueOption, issueOptionKey } from "./issueOption.js"

test("expanded issue details scroll to comments", async () => {
  const { renderer, mockInput, renderOnce, captureCharFrame } = await createTestRenderer({
    width: 72,
    height: 16,
  })

  try {
    const details = new IssueDetailsRenderable(renderer, {
      id: "details-test",
      width: "100%",
      height: "100%",
    })
    renderer.root.add(details)

    const option: IssueOption = {
      name: "Long issue",
      description: "owner/repo #1",
      value: {
        repository: "owner/repo",
        issue: {
          html_url: "https://github.com/owner/repo/issues/1",
          number: 1,
          title: "Long issue",
          state: "open",
          repository_url: "https://api.github.com/repos/owner/repo",
          updated_at: "2026-07-17T00:00:00Z",
          labels: [],
          body: Array.from({ length: 20 }, (_, index) => `Paragraph ${index + 1}`).join("\n\n"),
          user: { login: "author" },
        },
      },
    }

    details.setOption(option)
    const issueBody = details.findDescendantById("details-test-content-1-body")
    expect(issueBody).not.toBeNull()
    details.setCommentsLoading(issueOptionKey(option))
    expect(details.findDescendantById("details-test-content-1-body")).toBe(issueBody)
    details.setComments(issueOptionKey(option), [
      {
        id: 1,
        body: "The final comment body.",
        created_at: "2026-07-17T01:00:00Z",
        user: { login: "reviewer" },
      },
    ])
    expect(details.findDescendantById("details-test-content-1-body")).toBe(issueBody)
    details.setExpanded(true)

    for (let attempt = 0; attempt < 20 && !captureCharFrame().includes("Paragraph 1"); attempt++) {
      await renderOnce()
      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    expect(captureCharFrame()).toContain("Paragraph 1")
    expect(captureCharFrame()).not.toContain("@reviewer")

    mockInput.pressKey("END")
    await renderOnce()
    await renderOnce()

    const scrolled = captureCharFrame()
    expect(scrolled).toContain("@reviewer")
    expect(scrolled).toContain("The final comment body.")

    details.setMessage("Loading")
    details.setOption(option)
    details.setComments(issueOptionKey(option), [
      {
        id: 1,
        body: "The final comment body.",
        created_at: "2026-07-17T01:00:00Z",
        user: { login: "reviewer" },
      },
    ])
    for (let attempt = 0; attempt < 20 && !captureCharFrame().includes("Paragraph 1"); attempt++) {
      await renderOnce()
      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    mockInput.pressKey("END")
    await renderOnce()
    await renderOnce()
    expect(captureCharFrame()).toContain("@reviewer")
  } finally {
    renderer.destroy()
  }
})
