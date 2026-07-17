export interface IssueDraft {
  readonly repository: string
  readonly title: string
  readonly body: string
  readonly labels: ReadonlyArray<string>
}
