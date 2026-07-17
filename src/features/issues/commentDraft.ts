import type { IssueOption } from "./issueOption.js"

export interface CommentDraft {
  readonly option: IssueOption
  readonly body: string
}
