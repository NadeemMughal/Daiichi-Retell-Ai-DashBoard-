import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Daiichi Agent Intelligence",
  description: "Secure performance reporting for Daiichi-managed AI agents"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

