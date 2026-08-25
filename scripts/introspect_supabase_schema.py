"""
Live Supabase schema introspection script.
Generates docs/supabase-schema.sql from the running database via PostgREST.
Run after every migration:
  python scripts/introspect_supabase_schema.py
"""
import os, json, requests
from dotenv import load_dotenv

load_dotenv()
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_KEY")
resp = requests.get(
    f"{url}/rest/v1/",
    headers={"apikey": key, "Authorization": f"Bearer {key}", "Accept": "application/openapi+json"},
    timeout=30,
)
resp.raise_for_status()
data = resp.json()

def pg_type(prop):
    t = prop.get("type", "text")
    fmt = prop.get("format", "")
    if t == "string":
        if "timestamp with time zone" in fmt:
            return "TIMESTAMP WITH TIME ZONE"
        if "date" == fmt:
            return "DATE"
        if "uuid" in fmt:
            return "UUID"
        if "text" in fmt:
            return "TEXT"
        if "character varying" in fmt:
            return "VARCHAR(255)"
        if "public.vector" in fmt:
            return "VECTOR(768)"
        return "TEXT"
    if t == "number":
        if "numeric" in fmt:
            return "NUMERIC"
        return "NUMERIC"
    if t == "integer":
        return "INTEGER"
    if t == "boolean":
        return "BOOLEAN"
    if t == "array":
        return "TEXT[]"
    if t == "object":
        return "JSONB"
    return "TEXT"

lines = [
    "-- Live Supabase schema generated from PostgREST introspection.",
    "-- This file is the ground-truth reference for the LifeOS database.",
    "-- Regenerate it after every schema change by running:",
    "--   python introspect_db.py",
    "-- or by querying the Supabase REST root with an openapi accept header.",
    "",
    "CREATE EXTENSION IF NOT EXISTS vector;",
    "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";",
    "",
]

# Sort tables but keep advisor_* together alphabetically within their group
for name in sorted(data["definitions"].keys()):
    defn = data["definitions"][name]
    props = defn.get("properties", {})
    required = set(defn.get("required", []))
    lines.append(f"-- Table: {name}")
    lines.append(f"CREATE TABLE IF NOT EXISTS {name} (")
    cols = []
    for col in sorted(props.keys()):
        prop = props[col]
        t = pg_type(prop)
        nullable = " NOT NULL" if col in required else ""
        cols.append(f"    {col} {t}{nullable}")
    lines.append(",\n".join(cols))
    lines.append(");")
    lines.append("")

with open("docs/supabase-schema.sql", "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

print("Wrote docs/supabase-schema.sql")
