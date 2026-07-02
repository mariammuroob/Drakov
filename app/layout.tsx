import type { Metadata } from "next";
import { Inter, Roboto_Mono } from "next/font/google";
import { AnonymousAuthBootstrap } from "@/components/anonymous-auth-bootstrap";
import "./globals.css";

const sans = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const mono = Roboto_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Blackstone",
  description: "Blackstone application",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AnonymousAuthBootstrap />
        {children}
      </body>
    </html>
  );
}
