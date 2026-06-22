import "../styles/globals.css";
import type { Metadata } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next"
import DuelBanner from "@/components/DuelBanner";

export const metadata: Metadata = {
  title: "Wahadle",
  description: "Guess the 40K datasheet by its stats",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-neutral-950 text-neutral-100 antialiased">
        <div className="max-w-7xl mx-auto p-4">
          <DuelBanner />
          {children}
          <SpeedInsights />
        </div>
      </body>
    </html>
  );
}