#!/usr/bin/env python3
"""Validate a restored database against the canonical reference.

The canonical reference is the database that the canonical dump was imported
into. This script compares, for every table:

  * the column list (name, type, nullability, default, extra)
  * the primary key
  * the row count
  * a checksum over every row, ordered by primary key

A difference in any of these means the restore did not reproduce the canonical
state exactly and must not be promoted to the live database.

Usage:
    python scripts/validate_restore.py <candidate_db> [<reference_db>]

Defaults to comparing "kindred_mig_test" against "kindred_d10_check".
"""

from __future__ import annotations

import argparse
import hashlib
import subprocess
import sys

MYSQL = r"C:\xampp\mysql\bin\mysql.exe"
PORT = "3308"
USER = "root"


def mysql(sql: str) -> str:
    """Run a query and return stdout, raising on any MySQL error."""
    result = subprocess.run(
        [MYSQL, "-u", USER, "--protocol=TCP", "-P", PORT, "--batch", "--raw", "-e", sql],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if result.returncode != 0:
        raise RuntimeError(f"MySQL error:\n{result.stderr.strip()}")
    return result.stdout


def mysql_rows(sql: str) -> list[list[str]]:
    """Run a query and return the rows as lists of strings."""
    out = mysql(sql)
    lines = [line for line in out.splitlines() if line != ""]
    if not lines:
        return []
    return [line.split("\t") for line in lines[1:]]


def tables(schema: str) -> list[str]:
    out = mysql(
        "SELECT table_name FROM information_schema.tables "
        f"WHERE table_schema = '{schema}' AND table_type = 'BASE TABLE' ORDER BY table_name;"
    )
    return [line for line in out.splitlines()[1:] if line]


def column_names(schema: str, table: str) -> list[str]:
    out = mysql(
        "SELECT column_name FROM information_schema.columns "
        f"WHERE table_schema = '{schema}' AND table_name = '{table}' "
        "ORDER BY ordinal_position;"
    )
    return [line for line in out.splitlines()[1:] if line]


def columns(schema: str, table: str) -> list[str]:
    out = mysql(
        "SELECT column_name, column_type, is_nullable, column_default, extra "
        "FROM information_schema.columns "
        f"WHERE table_schema = '{schema}' AND table_name = '{table}' "
        "ORDER BY ordinal_position;"
    )
    return [line for line in out.splitlines()[1:] if line]


def primary_key(schema: str, table: str) -> list[str]:
    out = mysql(
        "SELECT column_name FROM information_schema.key_column_usage "
        f"WHERE table_schema = '{schema}' AND table_name = '{table}' "
        "AND constraint_name = 'PRIMARY' ORDER BY ordinal_position;"
    )
    return [line for line in out.splitlines()[1:] if line]


def row_count(schema: str, table: str) -> int:
    return int(mysql(f"SELECT COUNT(*) FROM `{schema}`.`{table}`;").splitlines()[1])

def row_checksum(schema: str, table: str, pk: list[str], col_names: list[str]) -> str:
    """A stable checksum over every row of a table, ordered by primary key.

    Each row is flattened with COALESCE so that NULL and the empty string stay
    distinguishable, and joined with a separator that cannot occur in the
    data.

    GROUP_CONCAT is deliberately NOT used here: its result is truncated at
    group_concat_max_len (1024 bytes by default), so a table with more than a
    few rows would silently produce a different digest than the same data
    split across two calls. Instead the digests are folded together with a
    running MD5 in Python, which has no size limit.
    """
    if not col_names:
        return "0"
    order_expr = ", ".join(f"`{c}`" for c in pk) if pk else "1"
    flatten = ", ".join(
        f"COALESCE(CAST(`{c}` AS CHAR), '<NULL>')" for c in col_names
    )
    sql = (
        f"SELECT MD5(CONCAT_WS(CHAR(1), {flatten})) AS d "
        f"FROM `{schema}`.`{table}` "
        f"ORDER BY {order_expr};"
    )
    rows = mysql_rows(sql)
    digests = [row[0] for row in rows]
    # Fold the ordered per-row digests into one digest.
    running = hashlib.md5()
    for digest in digests:
        running.update(digest.encode("utf-8"))
    return f"{len(digests)}:{running.hexdigest()}"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("candidate", nargs="?", default="kindred_mig_test")
    parser.add_argument("reference", nargs="?", default="kindred_d10_check")
    args = parser.parse_args()

    cand_tables = tables(args.candidate)
    ref_tables = tables(args.reference)

    print(f"candidate : {args.candidate}  ({len(cand_tables)} tables)")
    print(f"reference : {args.reference}  ({len(ref_tables)} tables)")
    print()

    failures: list[str] = []

    only_cand = sorted(set(cand_tables) - set(ref_tables))
    only_ref = sorted(set(ref_tables) - set(cand_tables))
    if only_cand:
        failures.append(f"tables only in candidate: {only_cand}")
    if only_ref:
        failures.append(f"tables only in reference: {only_ref}")

    header = f"{'table':<26} {'rows(cand)':>10} {'rows(ref)':>10}  cols  pk   digest"
    print(header)
    print("-" * len(header))

    for table in sorted(set(cand_tables) & set(ref_tables)):
        cand_cols = columns(args.candidate, table)
        ref_cols = columns(args.reference, table)
        cols_ok = cand_cols == ref_cols

        cand_pk = primary_key(args.candidate, table)
        ref_pk = primary_key(args.reference, table)
        pk_ok = cand_pk == ref_pk

        cand_n = row_count(args.candidate, table)
        ref_n = row_count(args.reference, table)

        if cols_ok and pk_ok:
            cand_d = row_checksum(args.candidate, table, cand_pk, column_names(args.candidate, table))
            ref_d = row_checksum(args.reference, table, ref_pk, column_names(args.reference, table))
            digest = "OK" if cand_d == ref_d else "MISMATCH"
            if digest == "MISMATCH":
                failures.append(f"{table}: row digest mismatch ({cand_d} != {ref_d})")
        else:
            digest = "SKIPPED"
            if not cols_ok:
                failures.append(f"{table}: column definition differs")
            if not pk_ok:
                failures.append(f"{table}: primary key differs")

        if cand_n != ref_n:
            failures.append(f"{table}: row count differs ({cand_n} != {ref_n})")

        flag = "" if cols_ok else " COLS-DIFF"
        print(
            f"{table:<26} {cand_n:>10} {ref_n:>10}  "
            f"{'ok' if cols_ok else 'DIFF':<4} "
            f"{'ok' if pk_ok else 'DIFF':<2} {digest}{flag}"
        )

    print()
    if failures:
        print("VALIDATION FAILED:")
        for item in failures:
            print(f"  - {item}")
        return 1

    print("VALIDATION PASSED: the candidate reproduces the reference exactly.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
