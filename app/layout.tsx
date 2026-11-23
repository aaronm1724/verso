import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Verso — Understand the songs you love.",
  description:
    "Verso connects to Spotify, identifies what you're currently listening to, and shows you the lyrics translated into your language.",
  appleWebApp: {
    capable: true,
    title: "Verso",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#09090b",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 font-sans text-zinc-50">
        {children}
      </body>
    </html>
  );
}
