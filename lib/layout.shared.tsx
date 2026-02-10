import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import Image from "next/image";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          <Image
            src="/favicon/android-chrome-192x192.png"
            alt="MBBSPedia"
            width={24}
            height={24}
            className="rounded-sm"
          />
          <span className="font-[family-name:var(--font-inter)] tracking-tight">
            MBBSPedia
          </span>
        </>
      ),
    },
  };
}
