import type { Metadata } from "next";
import { Geist, Geist_Mono, Outfit } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "DigiActiva — Agentes IA, WhatsApp y CRM para negocios locales",
  description:
    "Automatiza la atención, captura leads y cierra ventas con agentes IA conectados a tu CRM. Ideal para restaurantes, clínicas, abogados e inmobiliarias en Chile y España.",
  keywords: [
    "DigiActiva",
    "agentes IA",
    "WhatsApp Business",
    "CRM",
    "leads",
    "Chile",
    "España",
    "negocios locales",
  ],
  authors: [{ name: "DigiActiva" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "DigiActiva — Agentes IA, WhatsApp y CRM",
    description:
      "Automatiza la atención, captura leads y cierra ventas con agentes IA.",
    siteName: "DigiActiva",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${outfit.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
