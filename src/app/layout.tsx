import type { Metadata, Viewport } from "next";
import { Source_Sans_3, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

const sans = Source_Sans_3({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-app-sans",
});

const serif = Source_Serif_4({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
  display: "swap",
  variable: "--font-app-serif",
});

export const metadata: Metadata = {
  title: "Askuala",
  description: "Askuala — college planner with Askuala Buddy, an assistant that knows your courses.",
  applicationName: "Askuala",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Askuala",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false, email: false },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
      { url: "/icon.png", type: "image/png", sizes: "1024x1024" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f1e6" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0d" },
  ],
};

const themeBoot = `(()=>{try{var t=localStorage.getItem("askuala-theme");if(!t){var m=document.cookie.match(/(?:^|; )askuala-theme=([^;]*)/);t=m&&decodeURIComponent(m[1]);}t=t||"system";document.documentElement.setAttribute("data-theme",t);if(t)localStorage.setItem("askuala-theme",t);}catch(e){document.documentElement.setAttribute("data-theme","system");}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body className={`${sans.className} min-h-dvh bg-canvas text-ink`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
