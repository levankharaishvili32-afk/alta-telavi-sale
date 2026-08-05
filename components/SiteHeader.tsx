import Image from "next/image";
import Link from "next/link";
import { categories } from "@/lib/catalog";

/**
 * Derived from the imported catalog rather than hardcoded, so re-running
 * `npm run scrape` with a different product list can never leave the nav
 * pointing at a category that no longer exists.
 */
const NAV = [
  ...categories.map((c) => ({
    href: `/?cat=${c.id}#catalog`,
    label: c.label,
  })),
  { href: "/?stock=1#catalog", label: "მარაგშია" },
];

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" aria-label="ალტა — მთავარი" className="shrink-0">
          <Image
            src="/brand/alta-logo.svg"
            alt="ალტა ALTA"
            width={4625}
            height={761}
            priority
            className="h-7 w-auto sm:h-8"
          />
        </Link>

        <nav className="ml-6 hidden items-center gap-1 text-sm font-medium text-alta-purple-deep lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 transition hover:bg-alta-50 hover:text-alta-purple"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <a
          href="tel:+995322380038"
          className="alta-corners ml-auto shrink-0 bg-alta-purple px-4 py-2.5 text-sm font-bold text-white transition hover:bg-alta-700"
        >
          <span className="hidden sm:inline">დაგვიკავშირდით: </span>+995 32 238
          00 38
        </a>
      </div>

      <div className="alta-rule h-1 w-full" />
    </header>
  );
}
