import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dexter API",
  description: "Dexter experiment plan generation API",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
