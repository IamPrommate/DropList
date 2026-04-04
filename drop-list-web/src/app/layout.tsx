import type { Metadata } from "next";
import { Noto_Sans, Noto_Sans_Thai } from "next/font/google";
import "./globals.css";
import "antd/dist/reset.css";
import { ConfigProvider, App as AntdApp, theme } from "antd";
import Providers from "./components/Providers";

const notoSans = Noto_Sans({
  variable: "--font-noto-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const notoSansThai = Noto_Sans_Thai({
  variable: "--font-noto-sans-thai",
  subsets: ["thai"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "DropList - Modern Music Player",
  description: "A modern, beautiful music player with Google Drive integration",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        suppressHydrationWarning
        className={`${notoSans.variable} ${notoSansThai.variable} antialiased`}
      >
        <Providers>
          <ConfigProvider
            theme={{
              algorithm: theme.darkAlgorithm,
              token: {
                colorPrimary: "#00f594",
                colorBgBase: "#0f1921",
                colorBgContainer: "#152028",
                colorBgElevated: "#1e272f",
                colorBorder: "rgba(255, 255, 255, 0.08)",
                colorBorderSecondary: "rgba(255, 255, 255, 0.06)",
                colorText: "#ffffff",
                colorTextSecondary: "#a2acb3",
                colorTextTertiary: "#73818c",
                colorError: "#ff0040",
                borderRadius: 8,
                fontFamily:
                  "var(--font-noto-sans), var(--font-noto-sans-thai), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              },
            }}
          >
            <AntdApp>{children}</AntdApp>
          </ConfigProvider>
        </Providers>
      </body>
    </html>
  );
}
