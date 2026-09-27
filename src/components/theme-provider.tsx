"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// next-themes renders an inline <script> that sets the theme class before
// paint. The server copy is the one that runs; on the client React 19 warns
// about rendering a <script> ("Scripts inside React components are never
// executed…"). Marking the client copy as JSON makes it inert, silencing the
// warning; the element carries suppressHydrationWarning, so the attribute
// difference is fine.
const scriptProps =
  typeof window === "undefined"
    ? undefined
    : ({ type: "application/json" } as const);

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider scriptProps={scriptProps} {...props}>
      {children}
    </NextThemesProvider>
  );
}
