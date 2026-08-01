import type { Metadata } from "next";
import "./globals.css";
import { LOCALE, t } from "../i18n";

export const metadata: Metadata = {
  title: t("app.title"),
  description: t("app.description"),
};

// The document's language comes from the active locale rather than a literal,
// so a second catalogue changes what assistive technology announces without
// anyone having to remember this line.
const documentLanguage = LOCALE.split("-")[0];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang={documentLanguage}
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
