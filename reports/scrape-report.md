# alta.ge სქრეიპის ანგარიში

დაწყება: 2026-08-05 10:52
რეჟიმი: full + no-images

| მაჩვენებელი | რაოდენობა |
| --- | --- |
| CSV-ში სულ | 347 |
| დამუშავებული | 347 |
| წარმატებული | 336 |
| ვერ მოიძებნა alta.ge-ზე | 11 |
| შეცდომით დასრულდა | 0 |
| ფოტოს გარეშე | 0 |
| CSV-ში ფასის კონფლიქტით მონიშნული | 6 |

## ვერ მოიძებნა alta.ge-ზე (11)

საძიებო API-მ ამ კოდებზე დამთხვევა ვერ დააბრუნა — პროდუქტი სავარაუდოდ მოხსნილია საიტიდან.

| კოდი | CSV დასახელება |
| --- | --- |
| 175458 | Marvo Quaz Wireless In-Ear Earbuds |
| 175465 | Xtrike Me GH-511 RGB Gaming Headset |
| 175473 | XTRIKE ME GH-510  wired headset |
| 175461 | MARVO Pact 60  Wireless Gaming Controller |
| 174906 | Ideapad Slim 5 14" OLED  Ultra 5 135H 16GB 512GB SSD Integrated Graphics Luna Grey |
| 175958 | Network Active/ Router/ TP-Link/ TP-Link ARCHER AX56 AX3000 Gigabit Wi-Fi 6 Router |
| 113313 | HR2545/00 |
| 102399 | EP2030/10 |
| 167694 | SENCOR STM 3787CH |
| 139830 | BRAUN SI1080VI |
| 174935 | Honor X5c 4GB/64GB Dual Sim Ocean Cian |

## შეცდომით დასრულდა (0)

_არცერთი._

## ფოტოს გარეშე (0)

_არცერთი._

## ფოტოს ჩამოტვირთვა ვერ მოხერხდა (0)

_არცერთი._

## CSV-ში ფასის კონფლიქტით მონიშნული (6)

ამ სტრიქონებს თავად CSV-ს სვეტი `price_conflict` ნიშნავს. ფასები მაინც CSV-დან
აიღება უცვლელად — სია მხოლოდ იმისთვისაა, რომ ხელით გადაამოწმო.

| კოდი | დასახელება | ძველი ფასი | აქციის ფასი |
| --- | --- | --- | --- |
| 169292 | Samsung A075F Galaxy A07 6GB/128GB LTE Duos Green | 389 | 309 |
| 169293 | Samsung A075F Galaxy A07 4GB/128GB LTE Duos Light Violet | 349 | 289 |
| 169305 | Samsung A075F Galaxy A07 6GB/128GB LTE Duos Light Violet | 389 | 309 |
| 169590 | Honor X7d 8GB/256GB Meteor Silver | 679 | 619 |
| 169591 | Honor X7d 8GB/256GB Desert Gold | 679 | 619 |
| 169595 | Honor X7d 8GB/128GB Velvet Black | 579 | 519 |

---

განმეორებითი გაშვება: `npm run scrape` — ყველა პასუხი ქეშირებულია `.cache/`-ში,
ამიტომ ხელახლა გაშვება მხოლოდ იმას ჩამოტვირთავს, რაც აკლია. სრული განახლებისთვის:
`npm run scrape -- --refresh`.
