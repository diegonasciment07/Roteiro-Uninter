import type { Metadata } from "next";

import "leaflet/dist/leaflet.css";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Roteiros UNINTER",
  description: "Planejador de encontros e viagens de visita dos polos UNINTER.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
