import Image from "next/image";
import { CAMPAIGN_END_INCLUSIVE } from "@/lib/campaign";

const BRANCH = {
  address: "ქ. თელავი, ალაზნის გამზირი 77, სავაჭრო ცენტრი „თელავი მოლი“",
  hours: "ორშ – შაბ: 10:00 – 20:00",
  phone: "+995 32 238 00 38",
  /** `tel:` needs the number without spaces. */
  phoneHref: "tel:+995322380038",
  email: "info@alta.ge",
};

type Social = {
  name: string;
  href: string;
  /** Georgian, because it is what a screen reader will read out. */
  label: string;
  /** Tailwind text colour applied on hover — each platform's own. */
  hover: string;
  icon: React.ReactNode;
};

const SOCIALS: Social[] = [
  {
    name: "Facebook",
    href: "https://www.facebook.com/alta.ge",
    label: "Alta Facebook-ზე",
    hover: "hover:text-[#1877F2] focus-visible:text-[#1877F2]",
    icon: (
      <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.5-3.91 3.77-3.91 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.44 2.91h-2.34V22c4.78-.76 8.44-4.92 8.44-9.94Z" />
    ),
  },
  {
    name: "Instagram",
    href: "https://www.instagram.com/alta.ge/",
    label: "Alta Instagram-ზე",
    hover: "hover:text-[#E4405F] focus-visible:text-[#E4405F]",
    icon: (
      <>
        <path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16Zm0 1.98c-3.14 0-3.51.01-4.75.07-1.15.05-1.77.24-2.18.4-.55.22-.94.47-1.35.88-.41.41-.66.8-.88 1.35-.16.41-.35 1.03-.4 2.18-.06 1.24-.07 1.61-.07 4.75s.01 3.51.07 4.75c.05 1.15.24 1.77.4 2.18.22.55.47.94.88 1.35.41.41.8.66 1.35.88.41.16 1.03.35 2.18.4 1.24.06 1.61.07 4.75.07s3.51-.01 4.75-.07c1.15-.05 1.77-.24 2.18-.4.55-.22.94-.47 1.35-.88.41-.41.66-.8.88-1.35.16-.41.35-1.03.4-2.18.06-1.24.07-1.61.07-4.75s-.01-3.51-.07-4.75c-.05-1.15-.24-1.77-.4-2.18-.22-.55-.47-.94-.88-1.35-.41-.41-.8-.66-1.35-.88-.41-.16-1.03-.35-2.18-.4-1.24-.06-1.61-.07-4.75-.07Z" />
        <path d="M12 6.87a5.13 5.13 0 1 0 0 10.26 5.13 5.13 0 0 0 0-10.26Zm0 8.46a3.33 3.33 0 1 1 0-6.66 3.33 3.33 0 0 1 0 6.66Z" />
        <circle cx="17.34" cy="6.66" r="1.2" />
      </>
    ),
  },
  {
    name: "TikTok",
    href: "https://www.tiktok.com/@alta.ge",
    label: "Alta TikTok-ზე",
    hover: "hover:text-black focus-visible:text-black",
    icon: (
      <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.59 2.59 0 1 1 .77-5.06v-3.1a5.66 5.66 0 0 0-.77-.05A5.68 5.68 0 1 0 15.54 15.4V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3a4.29 4.29 0 0 1-3.24-1.48Z" />
    ),
  },
  {
    name: "YouTube",
    href: "https://www.youtube.com/@AltaOfficial",
    label: "Alta YouTube-ზე",
    hover: "hover:text-[#FF0000] focus-visible:text-[#FF0000]",
    icon: (
      <path d="M21.58 7.19a2.5 2.5 0 0 0-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42a2.5 2.5 0 0 0-1.77 1.77A26 26 0 0 0 2 12a26 26 0 0 0 .42 4.81 2.5 2.5 0 0 0 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42a2.5 2.5 0 0 0 1.77-1.77A26 26 0 0 0 22 12a26 26 0 0 0-.42-4.81ZM10 15.02V8.98L15.2 12 10 15.02Z" />
    ),
  },
];

/**
 * Site footer.
 *
 * Deliberately lighter than the header: white ground, a thin brand rule at the
 * top and one teal accent, so it closes the page without competing with the
 * product grid above it.
 *
 * The bottom padding is generous on purpose — the floating Messenger button is
 * fixed to the bottom-right corner, and at the very end of the page it would
 * otherwise sit on top of the last row of links.
 */
export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-alta-100 bg-white">
      <div className="alta-rule h-0.5 w-full" />

      <div className="mx-auto max-w-7xl px-4 pb-28 pt-10 sm:px-6 sm:pb-24 lg:px-8">
        <div className="flex flex-col items-center gap-8 text-center sm:flex-row sm:items-start sm:justify-between sm:text-left">
          <Image
            src="/brand/alta-logo.svg"
            alt="ალტა ALTA"
            width={4625}
            height={761}
            className="h-7 w-auto shrink-0"
          />

          <ul className="flex items-center gap-4">
            {SOCIALS.map((social) => (
              <li key={social.name}>
                <a
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.label}
                  title={social.label}
                  className={`grid size-10 place-items-center rounded-full text-alta-400 transition duration-200 hover:scale-110 focus-visible:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-alta-purple ${social.hover}`}
                >
                  {/* aria-hidden: the link already carries the label, so a
                      screen reader announcing the glyph too would repeat it. */}
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden
                    className="size-5 fill-current"
                  >
                    {social.icon}
                  </svg>
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-10 grid gap-8 text-center sm:grid-cols-3 sm:text-left">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-alta-purple-deep">
              მისამართი
            </p>
            <p className="mt-2 text-sm text-alta-700">{BRANCH.address}</p>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-alta-purple-deep">
              სამუშაო საათები
            </p>
            <p className="mt-2 text-sm text-alta-700">{BRANCH.hours}</p>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-alta-purple-deep">
              კონტაქტი
            </p>
            <p className="mt-2">
              <a
                href={BRANCH.phoneHref}
                className="text-sm font-bold text-alta-purple transition hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-alta-purple"
              >
                {BRANCH.phone}
              </a>
            </p>
            <p className="mt-1 text-sm text-alta-700">{BRANCH.email}</p>
          </div>
        </div>

        <p className="alta-corners mt-8 border-l-4 border-alta-teal bg-alta-50 px-4 py-3 text-xs leading-relaxed text-alta-700">
          აქციის ფასები მოქმედებს მხოლოდ თელავის ფილიალში,{" "}
          {CAMPAIGN_END_INCLUSIVE} ან მარაგის ამოწურვამდე. ფასები მითითებულია
          ლარში, დღგ-ის ჩათვლით.
        </p>
      </div>

      <div className="border-t border-alta-100 px-4 py-4 text-center text-xs text-alta-400">
        © {year} ალტა. ყველა უფლება დაცულია.
      </div>
    </footer>
  );
}
