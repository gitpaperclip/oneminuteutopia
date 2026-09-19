import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "One Minute Utopia · Report a neighborhood issue",
  description: "A better block starts with a photo. Report a neighborhood issue with an AI-assisted image assessment.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
