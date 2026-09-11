import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import CompareTable from "@/components/CompareTable";

export const metadata: Metadata = {
  title: "შედარება",
  description: "შეადარეთ პროდუქტები მახასიათებლების მიხედვით.",
};

export default function ComparePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <nav aria-label="ნავიგაცია" className="text-xs text-alta-400">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/" className="hover:text-alta-purple">
              მთავარი
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li className="font-medium text-alta-700">შედარება</li>
        </ol>
      </nav>

      {/* useSearchParams needs a suspense boundary to stay statically rendered. */}
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse bg-alta-50" />}>
        <CompareTable />
      </Suspense>
    </div>
  );
}
