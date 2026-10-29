"""Structured UI block builders for chat replies.

`GraphState["response"]` stays a plain string always (Telegram and any
non-UI client only ever see that). `GraphState["ui"]` is an ADDITIVE,
optional structured payload that UI clients (mobile/web chat) can render
instead of the plain text. Every field in a block must come from real data
the node already computed/fetched — never invent a number here that isn't
backed by `response`'s own text.

Two block types, matching what the app currently needs:
- confirmation: logging a meal/trade/workout (or removing one).
- stat_grid: answering a question about existing data (sleep, macros,
  training load, cash, portfolio, goals).
"""
from typing import Literal, Optional, TypedDict


class ConfirmationRow(TypedDict):
    label: str
    value: str


class ConfirmationBlock(TypedDict):
    type: Literal["confirmation"]
    status: Literal["logged", "removed", "error", "preview"]
    title: str
    subtitle: Optional[str]
    rows: list[ConfirmationRow]
    insight: Optional[str]
    metadata: Optional[dict]  # extra payload for UI actions (e.g. dry-run parsed items)


def confirmation_block(
    status: Literal["logged", "removed", "error", "preview"],
    title: str,
    rows: list[ConfirmationRow],
    subtitle: str | None = None,
    insight: str | None = None,
    metadata: dict | None = None,
) -> ConfirmationBlock:
    return {
        "type": "confirmation",
        "status": status,
        "title": title,
        "subtitle": subtitle,
        "rows": rows,
        "insight": insight,
        "metadata": metadata,
    }


class Stat(TypedDict):
    label: str
    value: str
    unit: Optional[str]
    caption: Optional[str]
    severity: Optional[Literal["good", "warn", "bad", "neutral"]]


class StatGridBlock(TypedDict):
    type: Literal["stat_grid"]
    title: str
    stats: list[Stat]


def stat_grid_block(title: str, stats: list[Stat]) -> StatGridBlock:
    return {"type": "stat_grid", "title": title, "stats": stats}


def stat(
    label: str,
    value: str,
    unit: str | None = None,
    caption: str | None = None,
    severity: Literal["good", "warn", "bad", "neutral"] | None = None,
) -> Stat:
    return {"label": label, "value": value, "unit": unit, "caption": caption, "severity": severity}
