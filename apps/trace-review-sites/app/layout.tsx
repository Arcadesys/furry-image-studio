import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "../../trace-review/src/styles.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost";
  const localHost = host.startsWith("localhost") || host.startsWith("127.");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (localHost ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = "Furry Image Studio Trace Review";
  const description = "Grade pipeline-produced character image traces with pinned evidence.";
  return {
    metadataBase: new URL(origin),
    title,
    description,
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
