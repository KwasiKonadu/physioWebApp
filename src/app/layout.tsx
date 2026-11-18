import type { Metadata } from "next";
import { Ubuntu, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const ubuntu = Ubuntu({
  variable: "--font-ubuntu",
  weight: ["300", "400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
});

const codeFont = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GMRS Physiotherapy Clinic Management",
  description:
    "Physiotherapy Clinic Management System — patient records, appointments, clinical assessments, treatment plans, therapy sessions, progress reviews, discharges, billing, packages, insurance, staff and reports.",
  keywords: ["physiotherapy", "clinic management", "GMRS", "healthcare", "Next.js"],
  icons: {
    icon: "/appicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${ubuntu.variable} ${codeFont.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
