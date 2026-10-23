#!/usr/bin/env python3
"""Compare a restored database against the canonical dump file, byte for byte.

The dump is the source of truth. A previously imported reference database can
itself be lossy - importing a dump through a client that does not send
utf8mb4 turns characters such as the superscript three (U+00B3) into "?" - so
comparing against the dump file is stricter and more meaningful than
comparing against another imported copy.

This script parses the INSERT statements of one table out of the dump and
compares every column of every row with the database.

Usage:
    python scripts/compare_db_to_dump.py <dump.sql> <schema> [table]
"""

from __future__ import annotations

import argparse
import subprocess
import sys

MYSQL = r"C:\xampp\mysql\bin\mysql.exe"
PORT = "3308"
USER = "root"


def mysql_rows(sql: str) -> list[list[str]]:
    result = subprocess.run(
        [MYSQL, "-u", USER, "--protocol=TCP", "-P", PORT, "--batch", "--raw", "-e", sql],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip())
    lines = result.stdout.splitlines()
    if not lines:
        return []
    return [line.split("\t") for line in lines[1:]]


def split_sql_tuple(text: str) -> list[str]:
    """Split one "(a, b, 'c')" tuple into its raw field strings.

    Commas inside quoted strings do not separate fields, and MySQL escapes a
    quote as either backslash-quote or doubled quote, so the scanner tracks
    both escape styles.
    """
    assert text.startswith("(") and text.endswith(")"), text[:40]
    body = text[1:-1]
    fields: list[str] = []
    current: list[str] = []
    in_string = False
    i = 0
    while i < len(body):
        char = body[i]
        if in_string:
            if char == "\\" and i + 1 < len(body):
                current.append(char)
                current.append(body[i + 1])
                i += 2
                continue
            if char == "'":
                if i + 1 < len(body) and body[i + 1] == "'":
                    current.append(char)
                    current.append(char)
                    i += 2
                    continue
                in_string = False
            current.append(char)
            i += 1
            continue
        if char == "'":
            in_string = True
            current.append(char)
            i += 1
            continue
        if char == ",":
            fields.append("".join(current).strip())
            current = []
            i += 1
            continue
        current.append(char)
        i += 1
    fields.append("".join(current).strip())
    return fields


def unquote(field: str) -> str | None:
    """Turn a raw SQL field into its value, or None for SQL NULL."""
    if field.upper() == "NULL":
        return None
    if field.startswith("'") and field.endswith("'"):
        body = field[1:-1]
        out: list[str] = []
        i = 0
        while i < len(body):
            char = body[i]
            if char == "\\" and i + 1 < len(body):
                nxt = body[i + 1]
                out.append({"n": "\n", "t": "\t", "r": "\r", "0": "\0"}.get(nxt, nxt))
                i += 2
                continue
            if char == "'" and i + 1 < len(body) and body[i + 1] == "'":
                out.append("'")
                i += 2
                continue
            out.append(char)
            i += 1
        return "".join(out)
    return field


def parse_dump_table(dump_path: str, table: str) -> tuple[list[str], list[list[str | None]]]:
    """Return (column names, rows) for one table from the dump file."""
    with open(dump_path, "r", encoding="utf-8", errors="surrogateescape") as handle:
        text = handle.read()

    marker = f"INSERT INTO `{table}` ("
    start = text.find(marker)
    if start == -1:
        raise SystemExit(f"table {table} not found in {dump_path}")

    open_paren = text.index("(", start + len(marker) - 1)
    depth = 0
    in_string = False
    col_end = open_paren
    i = open_paren
    while i < len(text):
        char = text[i]
        if in_string:
            if char == "\\":
                i += 2
                continue
            if char == "'":
                if i + 1 < len(text) and text[i + 1] == "'":
                    i += 2
                    continue
                in_string = False
            i += 1
            continue
        if char == "'":
            in_string = True
        elif char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
            if depth == 0:
                col_end = i
                break
        i += 1

    column_part = text[open_paren + 1 : col_end]
    columns = [c.strip().strip("`") for c in column_part.split(",")]

    values_at = text.index("VALUES", col_end)
    rows: list[list[str | None]] = []
    i = values_at + len("VALUES")
    while True:
        while i < len(text) and text[i] in " \r\n\t":
            i += 1
        if i >= len(text) or text[i] != "(":
            break
        depth = 0
        in_string = False
        j = i
        while j < len(text):
            char = text[j]
            if in_string:
                if char == "\\":
                    j += 2
                    continue
                if char == "'":
                    if j + 1 < len(text) and text[j + 1] == "'":
                        j += 2
                        continue
                    in_string = False
                j += 1
                continue
            if char == "'":
                in_string = True
            elif char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
                if depth == 0:
                    break
            j += 1
        tuple_text = text[i : j + 1]
        rows.append([unquote(f) for f in split_sql_tuple(tuple_text)])
        i = j + 1
        while i < len(text) and text[i] in " \r\n\t,":
            i += 1
        if i < len(text) and text[i] == ";":
            break
    return columns, rows


def normalise(value: str | None) -> str | None:
    """Render a value so that text and numeric forms compare equal.

    The dump stores a timestamp as '2026-05-11 16:53:15' while the database
    returns it unchanged, but numeric columns come back as '6' in both. The
    only normalisation needed is therefore to keep NULL distinct from ''.
    """
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dump")
    parser.add_argument("schema")
    parser.add_argument("table", nargs="?", default="test_results")
    args = parser.parse_args()

    columns, dump_rows = parse_dump_table(args.dump, args.table)
    print(f"dump table : {args.table}  ({len(dump_rows)} rows, {len(columns)} columns)")

    db_rows = mysql_rows(
        f"SELECT {', '.join('`' + c + '`' for c in columns)} "
        f"FROM `{args.schema}`.`{args.table}` ORDER BY `id`;"
    )
    print(f"db table   : {args.schema}.{args.table}  ({len(db_rows)} rows)")
    print()

    index = {row[0]: row for row in db_rows}
    failures = 0

    for row in dump_rows:
        row_id = row[0]
        db_row = index.get(row_id)
        if db_row is None:
            print(f"  MISSING in db: id={row_id}")
            failures += 1
            continue
        for position, column in enumerate(columns):
            want = normalise(row[position])
            got = normalise(db_row[position])
            if want != got:
                print(f"  DIFFERS id={row_id} column={column}")
                print(f"    dump: {want!r}")
                print(f"    db  : {got!r}")
                failures += 1

    extra = sorted(set(index) - {row[0] for row in dump_rows})
    if extra:
        print(f"  EXTRA rows in db: {extra[:10]} (total {len(extra)})")
        failures += len(extra)

    print()
    if failures:
        print(f"MISMATCH: {failures} difference(s)")
        return 1
    print(f"MATCH: every value of {args.table} equals the dump.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
