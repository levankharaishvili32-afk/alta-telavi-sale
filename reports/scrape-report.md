# alta.ge სქრეიპის ანგარიში

დაწყება: 2026-08-12 07:15
რეჟიმი: full + no-images

| მაჩვენებელი | რაოდენობა |
| --- | --- |
| CSV-ში სულ | 327 |
| დამუშავებული | 327 |
| წარმატებული | 312 |
| ვერ მოიძებნა alta.ge-ზე | 10 |
| შეცდომით დასრულდა | 5 |
| ფოტოს გარეშე | 0 |
| ფიდიდან აღდგენილი (მახასიათებლების გარეშე) | 32 |
| ხელით ამოღებული (excluded-products.json) | 4 |
| CSV-ში ფასის კონფლიქტით მონიშნული | 0 |

## ხელით ამოღებული (4)

ეს პროდუქტები ფასების ფაილშია, საიტზე კი განზრახ არ ხვდება —
`data/excluded-products.json`-ის მიხედვით. დასაბრუნებლად წაშალეთ იქიდან
შესაბამისი სტრიქონი და თავიდან გაუშვით `npm run scrape`.

| კოდი | CSV დასახელება | მიზეზი |
| --- | --- | --- |
| 99555 | Samsung VC18M31A0HP Red | Samsung VC18M31A0HP — removed at Levan's request, 12 Aug 2026 |
| 103123 | Samsung VC21K5170HG/EV Hepa13, 2100W, Suction-440w,Noise-84dBA,Weight-5.5 kg, 294x337x450 | Samsung VC21K5170HG/EV — removed at Levan's request, 12 Aug 2026 |
| 120636 | Samsung Jet 60 Cordless Stick Vacuum Cleaner JET VS15A6031R5/EV | Samsung Jet VS15A6031R5/EV — removed at Levan's request, 12 Aug 2026 |
| 79508 | Samsung VC18M21C0VN/EV | Samsung VC18M21C0VN/EV — removed at Levan's request, 12 Aug 2026 |

## ფიდიდან აღდგენილი (32)

alta.ge მიუწვდომელი იყო, ამიტომ ეს პროდუქტები `data/alta-catalog.json`-იდან
აიწყო: დასახელება, ბრენდი, ფოტო და ბმული სწორია, **მახასიათებლები კი არ აქვთ** —
შესაბამისად შედარების ცხრილში ცარიელია და მახასიათებლების ფილტრი მათ ვერ პოულობს.
შემდეგი `npm run scrape`, როცა alta.ge ხელმისაწვდომია, ავტომატურად ჩაანაცვლებს.

| კოდი | დასახელება |
| --- | --- |
| 161368 | Russell Hobbs 23912-70/RH Adventure Kettle Bru 2.4kW |
| 161371 | Russell Hobbs 26061-56/RH Honeycomb 2S Toaster Black |
| 161372 | Russell Hobbs 26810-56/RH 3 in 1 Sandwich Maker |
| 161376 | Russell Hobbs 24371-56/RH Inspire 2SL Toaster Black |
| 161378 | Russell Hobbs 24620-56/RH |
| 161387 | Russell Hobbs 26430-56/RH Distinctions 2S Toaster Blk |
| 161390 | Russell Hobbs 26520-56/RH SatisFry Air&Grill Multi 5.5 |
| 161394 | Russell Hobbs 26450-56/RH Distinctions Espresso Black |
| 167396 | Electrolux EAF12B Air Fryer |
| 106188 | Sencor SCG 1050WH |
| 106210 | Sencor STS 5050SS |
| 157724 | Sencor SHM 5400WH |
| 165721 | Sencor SRM 2000WH Low Carb Rice Cooker |
| 165733 | Sencor SMF 2030WH Milk Frother |
| 151189 | Smarton HM 020 Hot Dog Maker |
| 151190 | Smarton HM 050 Hot Dog Maker |
| 170907 | Apple iPhone 17 e-Sim Only (8GB/256GB) - Black |
| 171322 | Apple iPhone 17 e-Sim Only (8GB/256GB) - Mist Blue |
| 171321 | Apple iPhone 17 e-Sim Only (8GB/256GB) - Sage |
| 170908 | Apple iPhone 17 e-Sim Only (8GB/256GB) - White |
| 170906 | Apple iPhone 17 Pro e-Sim Only 12GB/256GB - Cosmic Orange |
| 170905 | Apple iPhone 17 Pro e-Sim Only 12GB/256GB - Deep Blue |
| 170898 | Apple iPhone 17 Pro e-Sim Only 12GB/256GB - Silver |
| 170902 | Apple iPhone 17 Pro Max e-Sim Only 12GB/256GB - Cosmic Orange |
| 170901 | Apple iPhone 17 Pro Max e-Sim Only 12GB/256GB - Deep Blue |
| 171022 | Apple iPhone 17 Pro Max e-Sim Only 12GB/256GB - Silver |
| 169789 | Apple iPhone Air 12GB/256GB - Space Black |
| 157981 | Apple iPhone 16 128GB - Pink |
| 157985 | Apple iPhone 16 128GB - Ultramarine |
| 145226 | Apple iPhone 15 128GB - Blue |
| 175817 | Xiaomi Redmi 15C 4GB/128GB Without Charger Mint Green |
| 175816 | Xiaomi Redmi 15C 4GB/128GB Without Charger Moonlight Blue |

## ვერ მოიძებნა alta.ge-ზე (10)

საძიებო API-მ ამ კოდებზე დამთხვევა ვერ დააბრუნა — პროდუქტი სავარაუდოდ მოხსნილია საიტიდან.

| კოდი | CSV დასახელება |
| --- | --- |
| 139830 | BRAUN SI1080VI |
| 167694 | SENCOR STM 3787CH |
| 102399 | EP2030/10 |
| 113313 | HR2545/00 |
| 174906 | Ideapad Slim 5 14" OLED Ultra 5 135H 16GB 512GB SSD Integrated Graphics Luna Grey |
| 175958 | Network Active/ Router/ TP-Link/ TP-Link ARCHER AX56 AX3000 Gigabit Wi-Fi 6 Router |
| 175461 | MARVO Pact 60 Wireless Gaming Controller |
| 175465 | Xtrike Me GH-511 RGB Gaming Headset |
| 175458 | Marvo Quaz Wireless In-Ear Earbuds |
| 175473 | XTRIKE ME GH-510 wired headset |

## შეცდომით დასრულდა (5)

| კოდი | CSV დასახელება | მიზეზი |
| --- | --- | --- |
| 161393 | 27131-56/RH | search failed: HTTP 403 |
| 155035 | SWK 7201BK | search failed: HTTP 403 |
| 162285 | HD9252/90 | search failed: HTTP 403 |
| 171320 | Apple iPhone 17 256GB Lavender E-sim/TP | search failed: HTTP 403 |
| 175819 | Xiaomi Redmi 15 6GB/128GB Without Charger Sandy Purple | search failed: HTTP 403 |

## ფოტოს გარეშე (0)

_არცერთი._

## ფოტოს ჩამოტვირთვა ვერ მოხერხდა (0)

_არცერთი._

## CSV-ში ფასის კონფლიქტით მონიშნული (0)

ამ სტრიქონებს თავად CSV-ს სვეტი `price_conflict` ნიშნავს. ფასები მაინც CSV-დან
აიღება უცვლელად — სია მხოლოდ იმისთვისაა, რომ ხელით გადაამოწმო.

_არცერთი._

---

განმეორებითი გაშვება: `npm run scrape` — ყველა პასუხი ქეშირებულია `.cache/`-ში,
ამიტომ ხელახლა გაშვება მხოლოდ იმას ჩამოტვირთავს, რაც აკლია. სრული განახლებისთვის:
`npm run scrape -- --refresh`.
