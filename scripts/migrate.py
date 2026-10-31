"""Apply numbered SQL migrations from docs/supabase-migrations/ and record them.

Usage:
    python scripts/migrate.py --status            # show applied / pending
    python scripts/migrate.py                     # apply all pending, in order
    python scripts/migrate.py --baseline 28       # mark 001..028 applied without running them

Needs DATABASE_URL (Supabase -> Connect -> Session pooler URI) in .env.
Migrations are idempotent (IF NOT EXISTS), so a re-run is safe. Each file runs
in its own transaction.
"""
import argparse
import os
import re
import sys

import psycopg2
from dotenv import load_dotenv

MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), "..", "docs", "supabase-migrations")
NUMBERED = re.compile(r"^(\d{3})-.+\.sql$")

load_dotenv()


def migration_files() -> list[tuple[int, str]]:
    out = []
    for name in sorted(os.listdir(MIGRATIONS_DIR)):
        m = NUMBERED.match(name)
        if m:
            out.append((int(m.group(1)), name))
    return out


def ensure_table(cur) -> None:
    cur.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations ("
        "version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
    )


def applied_versions(cur) -> set[str]:
    cur.execute("SELECT version FROM schema_migrations")
    return {r[0] for r in cur.fetchall()}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--baseline", type=int, metavar="N", help="record migrations 1..N as applied")
    args = ap.parse_args()

    url = os.getenv("DATABASE_URL")
    if not url:
        print("DATABASE_URL is not set (see .env.example).", file=sys.stderr)
        return 1

    conn = psycopg2.connect(url)
    try:
        with conn, conn.cursor() as cur:
            ensure_table(cur)
        with conn, conn.cursor() as cur:
            done = applied_versions(cur)
            files = migration_files()

            if args.baseline:
                for num, name in files:
                    version = name[:-4]
                    if num <= args.baseline and version not in done:
                        cur.execute("INSERT INTO schema_migrations (version) VALUES (%s)", (version,))
                        print(f"baselined {version}")
                return 0

            pending = [(n, f) for n, f in files if f[:-4] not in done]
            if args.status:
                for _, f in files:
                    print(("applied  " if f[:-4] in done else "PENDING  ") + f)
                return 0

        for _, name in pending:
            version = name[:-4]
            with open(os.path.join(MIGRATIONS_DIR, name), encoding="utf-8") as fh:
                sql = fh.read()
            with conn, conn.cursor() as cur:
                cur.execute(sql)
                cur.execute("INSERT INTO schema_migrations (version) VALUES (%s) ON CONFLICT DO NOTHING", (version,))
            print(f"applied {version}")
        if not pending:
            print("Nothing to apply.")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
