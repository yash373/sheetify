import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sheetify — Practice the song, not the search",
  description: "Turn a song into a focused piano practice sheet.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
