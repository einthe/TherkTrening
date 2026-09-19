import type { Metadata } from "next";
import { paletteInitializationScript } from "@/lib/palettes";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "TherkTrening",
  description:
    "Log workouts, pain measurements, and training sessions. Compare trends on a customizable dashboard.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-palette="forest" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: paletteInitializationScript }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
