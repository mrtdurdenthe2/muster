import { expect, test } from "bun:test"
import { createTestRenderer } from "@opentui/core/testing"
import { CommentComposerRenderable } from "./CommentComposerRenderable.js"
import type { CommentDraft } from "./commentDraft.js"
import type { IssueOption } from "./issueOption.js"

const option: IssueOption = {
  name: "Comment target",
  description: "owner/repo #7",
  value: {
    repository: "owner/repo",
    issue: {
      html_url: "https://github.com/owner/repo/issues/7",
      number: 7,
      title: "Comment target",
      state: "open",
      repository_url: "https://api.github.com/repos/owner/repo",
      updated_at: "2026-07-17T00:00:00Z",
      labels: [],
      body: null,
      user: { login: "author" },
    },
  },
}

test("comment composer validates and submits multiline comments", async () => {
  const { renderer, mockInput, renderOnce, captureCharFrame } = await createTestRenderer({
    width: 72,
    height: 16,
  })
  const submissions: CommentDraft[] = []

  try {
    const composer = new CommentComposerRenderable(renderer, {
      id: "comment-composer-test",
      width: "100%",
      height: "100%",
      onSubmit: (draft) => {
        submissions.push(draft)
      },
      onCancel: () => {},
    })
    renderer.root.add(composer)
    composer.open(option)

    mockInput.pressKey("F3")
    await renderOnce()
    expect(captureCharFrame()).toContain("Comment is required.")
    expect(submissions).toHaveLength(0)

    await mockInput.typeText("First line")
    mockInput.pressEnter()
    await mockInput.typeText("Second line")
    mockInput.pressKey("F3")
    await renderOnce()

    expect(submissions).toHaveLength(1)
    expect(submissions[0]?.option).toBe(option)
    expect(submissions[0]?.body).toBe("First line\nSecond line")
  } finally {
    renderer.destroy()
  }
})
