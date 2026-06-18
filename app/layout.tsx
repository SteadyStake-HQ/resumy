import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, Newsreader, Plus_Jakarta_Sans } from "next/font/google";
import { getServerSession } from "next-auth";
import { AppClientProviders } from "@/components/app-client-providers";
import { Navbar } from "@/components/navbar";
import { authOptions } from "@/lib/auth";
import "ckeditor5/ckeditor5.css";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Used by resume templates V1, V3, V4
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Resume Foundry",
    template: "%s | Resume Foundry",
  },
  description:
    "A polished resume workspace for analysis, tailoring, design exports, membership upgrades, and guided job-search workflows.",
  icons: {
    icon: "/icon.png",
    shortcut: "/favicon.ico",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession(authOptions);

  return (
    <html lang="en">
      <body
        className={`${plusJakartaSans.variable} ${fraunces.variable} ${ibmPlexMono.variable} ${newsreader.variable} bg-background text-foreground antialiased`}
      >
        <AppClientProviders showTaskQueue={Boolean(session?.user?.id)}>
          <div className="relative min-h-screen overflow-hidden">
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-[-7rem] top-20 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(198,187,255,0.48),rgba(198,187,255,0))] blur-3xl" />
              <div className="absolute right-[-6rem] top-8 h-60 w-60 rounded-full bg-[radial-gradient(circle,rgba(255,197,166,0.42),rgba(255,197,166,0))] blur-3xl" />
              <div className="absolute bottom-12 left-1/3 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(101,168,158,0.22),rgba(101,168,158,0))] blur-3xl" />
              <div className="absolute left-[12%] top-36 h-2 w-2 rounded-full bg-white/80 shadow-[3rem_2rem_0_0_rgba(255,255,255,0.65),13rem_5rem_0_0_rgba(198,187,255,0.7),32rem_1rem_0_0_rgba(255,197,166,0.7),48rem_8rem_0_0_rgba(255,255,255,0.72)]" />
            </div>
            <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-4 sm:px-6 lg:px-8">
              <Navbar />
              <main className="flex-1 pb-16 pt-4 sm:pb-20 sm:pt-8">{children}</main>
            </div>
          </div>
        </AppClientProviders>
      </body>
    </html>
  );
}
