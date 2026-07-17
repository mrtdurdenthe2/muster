export const truncate = (value: string, length: number): string => {
  if (value.length <= length) return value
  if (length <= 1) return value.slice(0, length)
  return `${value.slice(0, length - 1)}…`
}

export const formatDate = (value: string): string => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export const wrapText = (value: string, width: number): ReadonlyArray<string> => {
  if (width <= 0) return []

  return value.split("\n").flatMap((line) => {
    if (!line) return [""]

    const wrapped: string[] = []
    let remaining = line
    while (remaining.length > width) {
      const breakpoint = remaining.lastIndexOf(" ", width)
      const end = breakpoint > 0 ? breakpoint : width
      wrapped.push(remaining.slice(0, end))
      remaining = remaining.slice(end).trimStart()
    }
    wrapped.push(remaining)
    return wrapped
  })
}

export const limitedWrappedText = (value: string, width: number, maxLines: number): ReadonlyArray<string> => {
  const lines = wrapText(value, width)
  if (lines.length <= maxLines) return lines
  if (maxLines <= 0) return []

  const visible = lines.slice(0, maxLines)
  const lastLine = visible[visible.length - 1]
  visible[visible.length - 1] = width <= 1 ? "…" : `${lastLine.slice(0, width - 1)}…`
  return visible
}
