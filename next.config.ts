import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the on-screen dev indicator so it doesn't show up during client demos.
  devIndicators: false,
  // 画像の最適化（/_next/image）は、Basic認証（旧 proxy.ts）があったころ認証で止まるため切っていた。Basic認証は一旦外したが、戻すときのためにこのままにする
  // PoC では最適化せず、ブラウザが public/ の画像を直接読む
  images: { unoptimized: true },
  // 物件の写真をフォーム（Server Action）で送る。ブラウザで縮めてから送るが、標準の上限 1MB を超えることがあるので広げる
  // （写真は 2.5MB まで受け付ける：lib/photos.ts。Vercel の関数のリクエストの上限 4.5MB より小さくする）
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  // トップ（見本のログイン画面）は使わない（設計書 D5・D27）。アクセス制限（Basic認証）は一旦外している
  async redirects() {
    return [{ source: "/", destination: "/dashboard", permanent: false }];
  },
};

export default nextConfig;
