import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto grid max-w-2xl place-items-center px-4 py-28 text-center">
      <p className="text-6xl font-bold text-alta-purple">404</p>
      <h1 className="mt-4 text-2xl font-bold text-alta-purple-deep">
        გვერდი ვერ მოიძებნა
      </h1>
      <p className="mt-2 text-sm text-alta-700">
        შესაძლოა პროდუქტი აქციიდან მოიხსნა ან ბმული არასწორია.
      </p>
      <Link
        href="/"
        className="alta-corners mt-6 bg-alta-purple px-6 py-3 text-sm font-bold text-white transition hover:bg-alta-700"
      >
        დაბრუნება მთავარზე
      </Link>
    </div>
  );
}
