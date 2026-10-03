import { Analytics } from "@vercel/analytics/next";
import { Instrument_Sans, Newsreader } from "next/font/google";
import "./globals.css";


const interfaceFont = Instrument_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-interface",
});

const editorialFont = Newsreader({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-editorial",
});

export const metadata = {
  title: "Documento Unificado de Saúde",
  description:
    "Seu passaporte digital de saúde - Vacinação, documentos médicos e alertas em um só lugar",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" className={`${interfaceFont.variable} ${editorialFont.variable}`}>
      <head>
        <meta charSet="utf-8" />
      </head>
      <body className="antialiased min-h-screen">
        {children}
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  );
}
