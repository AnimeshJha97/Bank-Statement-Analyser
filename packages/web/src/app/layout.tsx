import type { Metadata } from "next";
import { Instrument_Sans } from "next/font/google";
import "./globals.css";
import { UserProvider } from "@/lib/api";
import { Sidebar } from "@/components/sidebar";

const instrumentSans = Instrument_Sans({ subsets: ["latin"], variable: "--sans" });

export const metadata: Metadata = {
  title: "Statement",
  description: "Privacy-first insights from your bank statements",
};

const themeInit = `try{var t=localStorage.getItem("statement.theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.dataset.theme="dark"}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={instrumentSans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        <UserProvider>
          <div className="flex min-h-screen font-sans">
            <Sidebar />
            <main className="min-w-0 flex-1">{children}</main>
          </div>
        </UserProvider>
      </body>
    </html>
  );
}
