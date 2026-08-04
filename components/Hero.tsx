import Image from "next/image";
import Link from "next/link";
import { categories, products } from "@/lib/catalog";
import { discountPercent } from "@/lib/format";
import BrandPattern from "./BrandPattern";
import AltaIcon from "./AltaIcon";

const PROMISES = [
  { icon: "home", label: "ორიგინალი ბრენდული ტექნიკა" },
  { icon: "delivery", label: "უფასო მიწოდება თელავში" },
  { icon: "warranty", label: "ოფიციალური გარანტია" },
] as const;

export default function Hero() {
  const maxDiscount = Math.max(
    ...products.map((p) => discountPercent(p.old_price, p.promo_price)),
  );

  return (
    <section className="relative overflow-hidden bg-alta-purple-deep">
      <div className="alta-gradient-deep absolute inset-0" />
      <div className="absolute inset-0 opacity-[0.16]">
        <BrandPattern
          patternId="hero-pipes"
          variant="pipes"
          density="light"
          tone="on-dark"
        />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-alta-purple-deep/70 to-transparent"
      />

      <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <Image
            src="/brand/alta-mark-white.svg"
            alt=""
            width={629}
            height={761}
            className="h-9 w-auto"
          />
          <span className="alta-corners bg-alta-teal px-3 py-1.5 text-xs font-bold text-alta-purple-deep">
            კახეთის რეგიონი
          </span>
          <span className="alta-corners bg-white/15 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/25">
            მარაგის ამოწურვამდე
          </span>
        </div>

        <h1 className="mt-6 max-w-3xl text-4xl font-bold leading-[1.12] text-white sm:text-5xl lg:text-6xl">
          თელავის დიდი ფასდაკლება
        </h1>

        <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/85 sm:text-lg">
          სამზარეულოს, სახლისა და პერსონალური მოვლის ტექნიკა —{" "}
          <span className="alta-corners bg-alta-teal px-2 py-0.5 font-bold text-alta-purple-deep">
            {maxDiscount}%-მდე
          </span>{" "}
          ფასდაკლებით. გაფილტრეთ კატეგორიით, ბრენდით ან ფასით და იპოვეთ
          თქვენთვის საუკეთესო შეთავაზება.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="#catalog"
            className="alta-corners bg-white px-6 py-3.5 text-sm font-bold text-alta-purple transition hover:bg-alta-50"
          >
            ნახეთ შეთავაზებები
          </Link>
          <Link
            href="/?stock=1#catalog"
            className="alta-corners border border-white/40 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-white/10"
          >
            მხოლოდ მარაგში არსებული
          </Link>
        </div>

        <ul className="mt-10 flex flex-wrap gap-x-8 gap-y-4 border-t border-white/15 pt-7">
          {PROMISES.map((p) => (
            <li key={p.label} className="flex items-center gap-2.5">
              <AltaIcon name={p.icon} size="md" />
              <span className="text-sm font-medium text-white/90">
                {p.label}
              </span>
            </li>
          ))}
        </ul>

        <dl className="mt-8 grid max-w-2xl grid-cols-3 gap-4">
          <div>
            <dt className="text-xs font-medium text-white/60">
              პროდუქტი აქციაზე
            </dt>
            <dd className="mt-0.5 text-3xl font-bold text-white">
              {products.length}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-white/60">კატეგორია</dt>
            <dd className="mt-0.5 text-3xl font-bold text-white">
              {categories.length}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-white/60">
              მაქს. ფასდაკლება
            </dt>
            <dd className="mt-0.5 text-3xl font-bold text-alta-teal">
              {maxDiscount}%
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
