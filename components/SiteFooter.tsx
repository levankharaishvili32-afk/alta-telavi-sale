import Image from "next/image";
import BrandPattern from "./BrandPattern";

export default function SiteFooter() {
  return (
    <footer className="relative mt-16 overflow-hidden bg-alta-purple-deep">
      <div className="alta-rule h-1 w-full" />
      <div className="absolute inset-0 opacity-25">
        <BrandPattern
          patternId="footer-dashes"
          variant="dashes"
          density="light"
          tone="on-dark"
        />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <Image
          src="/brand/alta-logo-white.svg"
          alt="ალტა ALTA"
          width={4625}
          height={761}
          className="h-8 w-auto"
        />

        <div className="mt-8 grid gap-8 md:grid-cols-3">
          <p className="max-w-sm text-sm leading-relaxed text-white/70">
            აქცია მოქმედებს მარაგის ამოწურვამდე. ფასები მითითებულია ლარში,
            დღგ-ის ჩათვლით. მონაცემები სინქრონიზებულია alta.ge-ის კატალოგთან.
          </p>
          <div className="text-sm text-white/70">
            <p className="font-semibold text-white">მისამართი</p>
            <p className="mt-2">თელავი, ერეკლე II-ის გამზირი</p>
            <p>ორშ – შაბ: 10:00 – 20:00</p>
          </div>
          <div className="text-sm text-white/70">
            <p className="font-semibold text-white">კონტაქტი</p>
            <p className="mt-2">+995 32 238 00 38</p>
            <p>info@alta.ge</p>
          </div>
        </div>
      </div>

      <div className="relative border-t border-white/10 px-4 py-4 text-center text-xs text-white/45">
        © 2026 ალტა — სადემონსტრაციო კამპანიის გვერდი
      </div>
    </footer>
  );
}
