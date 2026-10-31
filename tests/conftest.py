"""Shared test setup: put src/ on the path, isolate env, provide a fake Supabase."""
import itertools
import os
import sys
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

for var in ("SUPABASE_URL", "SUPABASE_SERVICE_KEY", "API_SECRET", "OPENROUTER_API_KEY", "TELEGRAM_ENABLED"):
    os.environ.pop(var, None)
os.environ.setdefault("OPENROUTER_API_KEY", "test-key")
from cryptography.fernet import Fernet  # noqa: E402
os.environ["CALENDAR_ENCRYPTION_KEY"] = Fernet.generate_key().decode()

OWNER = "11111111-1111-1111-1111-111111111111"


class _Query:
    def __init__(self, db, table):
        self.db, self.table = db, table
        self.op, self.payload = "select", None
        self.filters, self._order, self._limit, self._count = [], None, None, None
        self._negate = False

    # builders
    def select(self, *_a, count=None, **_k):
        self.op, self._count = "select", count
        return self

    def insert(self, row):
        self.op, self.payload = "insert", row
        return self

    def update(self, row):
        self.op, self.payload = "update", row
        return self

    def upsert(self, row, on_conflict=None):
        self.op, self.payload, self._conflict = "upsert", row, on_conflict
        return self

    def delete(self):
        self.op = "delete"
        return self

    @property
    def not_(self):
        self._negate = True
        return self

    def _f(self, fn):
        neg, self._negate = self._negate, False
        self.filters.append((lambda r: not fn(r)) if neg else fn)
        return self

    def eq(self, k, v): return self._f(lambda r: r.get(k) == v)
    def lte(self, k, v): return self._f(lambda r: r.get(k) is not None and str(r[k]) <= str(v))
    def gte(self, k, v): return self._f(lambda r: r.get(k) is not None and str(r[k]) >= str(v))
    def in_(self, k, vs): return self._f(lambda r: r.get(k) in vs)

    def is_(self, k, v):
        return self._f(lambda r: (r.get(k) is None) if v == "null" else r.get(k) == v)

    def order(self, k, desc=False):
        self._order = (k, desc)
        return self

    def limit(self, n):
        self._limit = n
        return self

    def execute(self):
        rows = self.db.tables.setdefault(self.table, [])
        match = lambda r: all(f(r) for f in self.filters)
        if self.op == "insert":
            new = [dict(r) for r in (self.payload if isinstance(self.payload, list) else [self.payload])]
            for r in new:
                r.setdefault("id", f"{self.table}-{next(self.db.ids)}")  # globally unique, even after deletes
                r.setdefault("created_at", datetime.now(timezone.utc).isoformat())  # DB default
            rows.extend(new)
            return SimpleNamespace(data=new, count=len(new))
        if self.op == "upsert":
            key = self._conflict
            hit = next((r for r in rows if key and r.get(key) == self.payload.get(key)), None)
            if hit:
                hit.update(self.payload)
                return SimpleNamespace(data=[hit], count=1)
            rows.append(dict(self.payload))
            return SimpleNamespace(data=[self.payload], count=1)
        hits = [r for r in rows if match(r)]
        if self.op == "update":
            for r in hits:
                r.update(self.payload)
            return SimpleNamespace(data=hits, count=len(hits))
        if self.op == "delete":
            for r in hits:
                rows.remove(r)
            return SimpleNamespace(data=hits, count=len(hits))
        if self._order:
            hits.sort(key=lambda r: str(r.get(self._order[0])), reverse=self._order[1])
        total = len(hits)
        if self._limit is not None:
            hits = hits[: self._limit]
        return SimpleNamespace(data=[dict(r) for r in hits], count=total)


class FakeSupabase:
    def __init__(self):
        self.tables: dict[str, list[dict]] = {}
        self.ids = itertools.count(1)

    def table(self, name):
        return _Query(self, name)

    def rows(self, name):
        return self.tables.get(name, [])


@pytest.fixture
def fake_sb(monkeypatch):
    """A FakeSupabase wired in as the shared client everywhere it is fetched."""
    from utils import supabase_client
    sb = FakeSupabase()
    sb.tables["user_profiles"] = [{"user_id": OWNER}]
    monkeypatch.setattr(supabase_client, "_client", sb)
    monkeypatch.setattr(supabase_client, "get_supabase", lambda: sb)
    for mod in ("utils.notify", "utils.push_notifications", "calendar_service", "auth"):
        m = sys.modules.get(mod)
        if m and hasattr(m, "get_supabase"):
            monkeypatch.setattr(m, "get_supabase", lambda: sb)
    return sb


@pytest.fixture
def owner_id():
    return OWNER
