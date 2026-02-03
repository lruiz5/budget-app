import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { ToastProvider } from "@/contexts/ToastContext";
import { UncategorizedCountProvider } from "@/contexts/UncategorizedCountContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Budget App",
  description: "Zero-based budget tracking application",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="overflow-hidden" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme');
                  var isDark = theme === 'dark' ||
                    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches) ||
                    (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
                  if (isDark) {
                    document.documentElement.classList.add('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${outfit.variable} antialiased hide-scrollbar overflow-hidden`}
      >
        <ThemeProvider>
          <ToastProvider>
            <UncategorizedCountProvider>
              {children}
            </UncategorizedCountProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
