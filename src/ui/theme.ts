export const issueListMinWidth = 36
export const issueDetailsMinWidth = 32
export const horizontalLayoutMinWidth = issueListMinWidth + issueDetailsMinWidth + 3

export const theme = {
  background: "#111111",
  surface: "#171717",
  surfaceRaised: "#1d1d1d",
  surfaceSelected: "#202a3a",
  blueSurfaceSubtle: "#19283c",
  redSurfaceSubtle: "#3a2020",
  border: "#2b2b2b",
  text: "#f4f4f5",
  textMuted: "#8b8b90",
  textSubtle: "#68686d",
  blue: "#1683ff",
  blueText: "#69aaff",
  blueMuted: "#bad8ff",
  error: "#f85149",
} as const

export const labelBackgroundColor = (color: string): string =>
  /^[0-9a-f]{6}$/i.test(color) ? `#${color}` : theme.border

export const labelTextColor = (color: string): string => {
  if (!/^[0-9a-f]{6}$/i.test(color)) return theme.text

  const red = Number.parseInt(color.slice(0, 2), 16)
  const green = Number.parseInt(color.slice(2, 4), 16)
  const blue = Number.parseInt(color.slice(4, 6), 16)
  return red * 0.299 + green * 0.587 + blue * 0.114 > 150 ? "#000000" : "#ffffff"
}
