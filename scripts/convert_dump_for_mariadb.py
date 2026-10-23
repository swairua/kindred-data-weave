#!/usr/bin/env python3
"""Convert a phpMyAdmin MySQL 8 dump into a MariaDB 10.4 compatible dump.

The canonical export produced by phpMyAdmin on MySQL 8.0 uses two constructs
that MariaDB 10.4 (the version shipped with XAMPP) does not accept:

  1. ``utf8mb4_0900_ai_ci``  - the MySQL 8 only collation. MariaDB has no such
     collation, so the statement fails with "Unknown collation".
  2. ``DEFAULT CURRENT_TIMESTAMP`` on a DATETIME column is accepted by both,
     but the MySQL 8 dump also emits ``int UNSIGNED`` / ``int(10) unsigned``
     display widths that MariaDB renders differently (this is cosmetic only
     and does not break the import).

Everything else in the canonical dump is portable: no generated columns, no
functional indexes, no CHECK constraints, no window functions and no CTEs.

Usage:
    python scripts/convert_dump_for_mariadb.py <input.sql> <output.sql>

The conversion is deliberately conservative. It rewrites only the collation
and removes nothing, so the output can be diffed against the input to confirm
that the only change was the collation.
"""

from __future__ import annotations

import argparse
import re
import sys

# MySQL 8 only collations -> the MariaDB 10.4 equivalent. utf8mb4_unicode_ci
# is used everywhere else in the dump, so it is the consistent replacement.
COLLATION_REWRITES = {
    "utf8mb4_0900_ai_ci": "utf8mb4_unicode_ci",
    "utf8mb4_0900_as_ci": "utf8mb4_unicode_ci",
    "utf8mb4_0900_bin": "utf8mb4_unicode_ci",
}


def convert(text: str) -> tuple[str, int]:
    """Rewrite MySQL 8 only collations. Returns the new text and a hit count."""
    hits = 0
    for source, target in COLLATION_REWRITES.items():
        pattern = re.compile(re.escape(source), re.IGNORECASE)
        text, count = pattern.subn(target, text)
        hits += count
    return text, hits


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", help="source .sql dump")
    parser.add_argument("output", help="destination .sql dump")
    args = parser.parse_args()

    with open(args.input, "r", encoding="utf-8", errors="surrogateescape") as handle:
        original = handle.read()

    converted, hits = convert(original)

    with open(args.output, "w", encoding="utf-8", errors="surrogateescape", newline="") as handle:
        handle.write(converted)

    print(f"converted: {args.input} -> {args.output}")
    print(f"collation rewrites: {hits}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
