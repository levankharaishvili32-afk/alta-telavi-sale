#!/usr/bin/env python3
"""
import-promo-xlsx.py — turn the commercial team's promotion workbook into
data/campaign-products.csv.

The CSV stays the interface to everything downstream: `npm run scrape` reads it
and nothing else decides which products are in the campaign or what they cost.
This script only translates the spreadsheet into that shape.

Python rather than Node, alone among the scripts here, because reading .xlsx
means unzipping a directory of XML and openpyxl already does it correctly. The
alternative was a fourth npm dependency the deployed site would never use.

What the workbook looks like
----------------------------
One sheet per commercial group, each with the same six columns:

    კატეგორია | ID | დასახელება | ძველი ფასი | ფასდაკლების ფასი | ფასდაკლების %

The sheet *name* is the group. Rows with an empty ID are padding and are
skipped — the August file carries about 350 of them. Ids repeat where the same
product is listed twice; the first row wins and the duplicate is reported.

The title column is not trustworthy — entries range from a full product name to
a bare part number ("26810-56/RH") to the id repeated back ("139830. BRAUN
SI1080VI"). It is written to the CSV for reference only; the scraper replaces it
with the real name from alta.ge.

Usage
-----
    python3 scripts/import-promo-xlsx.py <workbook.xlsx>
    python3 scripts/import-promo-xlsx.py <workbook.xlsx> --out /tmp/preview.csv

Prints a summary of what changed against the existing CSV, then writes it.
Run `npm run scrape` afterwards, then `npm run specs`, `npm run bundles`,
`npm run comparisons`, `npm run search-index`.
"""

import argparse
import csv
import json
import pathlib
import sys
from collections import Counter

import openpyxl

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT / "data" / "campaign-products.csv"
CATEGORY_MAP = ROOT / "data" / "csv-category-map.json"

FIELDS = [
    "id",
    "group",
    "category",
    "title",
    "old_price",
    "promo_price",
    "discount_pct",
    "price_conflict",
]


def clean_title(raw: str, product_id: str) -> str:
    """Strips the "<id>. " prefix some rows carry, and collapses whitespace."""
    title = " ".join(str(raw or "").split())
    for prefix in (f"{product_id}. ", f"{product_id}."):
        if title.startswith(prefix):
            title = title[len(prefix) :].strip()
            break
    return title


def money(value):
    """Prices are whole lari in this workbook; keep them that way in the CSV."""
    if value is None or value == "":
        return None
    number = float(value)
    return int(number) if number == int(number) else round(number, 2)


def read_workbook(path: pathlib.Path):
    book = openpyxl.load_workbook(path, data_only=True)
    rows, duplicates = [], []
    seen = {}

    for sheet_name in book.sheetnames:
        sheet = book[sheet_name]
        values = sheet.iter_rows(values_only=True)
        next(values, None)  # header
        for raw in values:
            if raw[1] in (None, ""):
                continue
            product_id = str(raw[1]).strip()
            old_price, promo_price = money(raw[3]), money(raw[4])
            if old_price is None or promo_price is None:
                duplicates.append((product_id, "no price"))
                continue

            record = {
                "id": product_id,
                "group": sheet_name.strip(),
                "category": str(raw[0] or "").strip(),
                "title": clean_title(raw[2], product_id),
                "old_price": old_price,
                "promo_price": promo_price,
                # Recomputed rather than copied: the workbook's own percentage
                # column is a float with fifteen decimal places, and on some
                # rows it disagrees with its own two price columns.
                "discount_pct": (
                    round((old_price - promo_price) / old_price * 100)
                    if old_price
                    else 0
                ),
                "price_conflict": "False",
            }

            if product_id in seen:
                first = seen[product_id]
                if (first["old_price"], first["promo_price"]) != (
                    old_price,
                    promo_price,
                ):
                    # Same product, two different prices. Not something this
                    # script may quietly pick a winner for.
                    record["price_conflict"] = "True"
                    first["price_conflict"] = "True"
                duplicates.append((product_id, sheet_name))
                continue

            seen[product_id] = record
            rows.append(record)

    return rows, duplicates


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("workbook")
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    args = parser.parse_args()

    source = pathlib.Path(args.workbook)
    if not source.exists():
        sys.exit(f"not found: {source}")

    rows, duplicates = read_workbook(source)
    out_path = pathlib.Path(args.out)

    # --- what changes -------------------------------------------------
    previous = {}
    if DEFAULT_OUT.exists():
        with DEFAULT_OUT.open(encoding="utf-8-sig") as handle:
            for row in csv.DictReader(handle):
                previous[row["id"]] = row

    incoming = {r["id"]: r for r in rows}
    added = sorted(set(incoming) - set(previous))
    removed = sorted(set(previous) - set(incoming))
    repriced = [
        (i, previous[i]["old_price"], previous[i]["promo_price"], r["old_price"], r["promo_price"])
        for i, r in incoming.items()
        if i in previous
        and (
            float(previous[i]["old_price"]) != float(r["old_price"])
            or float(previous[i]["promo_price"]) != float(r["promo_price"])
        )
    ]

    # --- categories the map has no label for --------------------------
    labels = json.loads(CATEGORY_MAP.read_text(encoding="utf-8"))
    known = set(labels.get("categories", {})) | set(labels.get("categorySlugs", {}))
    unmapped = Counter(r["category"] for r in rows if r["category"] not in known)

    print(f"{source.name}")
    print(f"  {len(rows)} products, {len(duplicates)} duplicate row(s) skipped")
    print(f"  {len(added)} new, {len(removed)} dropped, {len(repriced)} repriced")
    conflicts = [r["id"] for r in rows if r["price_conflict"] == "True"]
    if conflicts:
        print(f"  !! {len(conflicts)} listed twice at different prices: {conflicts}")
    if unmapped:
        print("  !! categories with no label in data/csv-category-map.json:")
        for category, n in unmapped.most_common():
            print(f"       {category}  ({n})")

    with out_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"  -> {out_path.relative_to(ROOT) if out_path.is_relative_to(ROOT) else out_path}")


if __name__ == "__main__":
    main()
