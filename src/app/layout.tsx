import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import {
  ACTIVE_THEME_FAMILY,
  ACTIVE_THEME_VARIANT,
  createThemeBootstrapScript,
  DEFAULT_THEME_MODE,
  getTheme,
  tamnestThemeManifest,
  ThemeProvider,
} from "@/components/theme";
import "./globals.css";

// Font hỗ trợ đầy đủ dấu tiếng Việt.
const beVietnam = Be_Vietnam_Pro({
  variable: "--font-be-vietnam",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
});

const activeTheme = getTheme({
  family: ACTIVE_THEME_FAMILY,
  variant: ACTIVE_THEME_VARIANT,
  mode: DEFAULT_THEME_MODE,
});
const themeBootstrapScript = createThemeBootstrapScript({
  family: ACTIVE_THEME_FAMILY,
  variant: ACTIVE_THEME_VARIANT,
  fallbackMode: DEFAULT_THEME_MODE,
});
const favicon = tamnestThemeManifest.assets.favicon;

export const metadata: Metadata = {
  title: {
    default: "NA — Quản lý nội bộ",
    template: "%s · NA",
  },
  description:
    "Hệ thống quản lý nội bộ công ty thiết kế & thi công nội thất NA",
  ...(favicon ? { icons: { icon: favicon } } : {}),
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="vi"
      suppressHydrationWarning
      data-theme={activeTheme.attribute}
      data-theme-family={ACTIVE_THEME_FAMILY}
      data-theme-variant={ACTIVE_THEME_VARIANT}
      data-color-mode={DEFAULT_THEME_MODE}
      className={`${beVietnam.variable} h-full antialiased`}
    >
      <head>
        {/*
          Thẻ <script> THƯỜNG, không dùng next/script. Script chống nháy theme phải
          chạy đồng bộ trước khi trình duyệt vẽ khung hình đầu tiên, nên nó nằm sẵn
          trong HTML server trả về và client chỉ hydrate lại.

          next/script là client component: dù `beforeInteractive` vẫn được chèn vào
          HTML, bản thân component đó mount ở client và TẠO MỚI một thẻ <script>.
          React DOM cảnh báo đúng chỗ này ("Encountered a script tag while rendering
          React component") vì script do client tạo ra thì không bao giờ chạy — tức
          là nó vừa ồn vừa vô ích. Xem react-dom-client.development.js, nhánh
          `case "script"` trong hàm tạo instance.
        */}
        <script
          id="tamnest-theme-bootstrap"
          dangerouslySetInnerHTML={{ __html: themeBootstrapScript }}
        />
      </head>
      <body className="min-h-full font-sans">
        <ThemeProvider
          family={ACTIVE_THEME_FAMILY}
          variant={ACTIVE_THEME_VARIANT}
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
