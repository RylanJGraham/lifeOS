"""Position math (db/positions.update_position_from_fill) — the source of truth for holdings."""
import pytest

from db.positions import update_position_from_fill

U = "u1"


def fill(sb, action, qty, price, **kw):
    return update_position_from_fill(sb, U, kw.pop("symbol", "VOO"), action, qty, price, **kw)


def pos(sb, symbol="VOO"):
    return next(r for r in sb.rows("advisor_positions") if r["symbol"] == symbol)


def test_first_buy_creates_position(fake_sb):
    fill(fake_sb, "buy", 10, 100)
    p = pos(fake_sb)
    assert p["quantity"] == 10 and p["average_cost"] == 100 and p["status"] == "open"
    assert p["source"] == "manual" and p["asset_class"] == "equity"


def test_buy_includes_fees_in_basis(fake_sb):
    fill(fake_sb, "buy", 10, 100, fees=10)
    assert pos(fake_sb)["average_cost"] == pytest.approx(101)


def test_second_buy_is_weighted_average_for_broker_rows(fake_sb):
    fill(fake_sb, "buy", 10, 100, source="jarvis")
    fill(fake_sb, "buy", 10, 120, source="jarvis")
    p = pos(fake_sb)
    assert p["quantity"] == 20 and p["average_cost"] == pytest.approx(110)


def test_second_buy_is_weighted_average_for_manual_rows(fake_sb):
    """Regression: manual rows used to freeze average_cost at the first buy."""
    fill(fake_sb, "buy", 10, 100)
    fill(fake_sb, "buy", 10, 120)
    p = pos(fake_sb)
    assert p["quantity"] == 20
    assert p["average_cost"] == pytest.approx(110)
    assert p["unrealized_pnl"] == pytest.approx((120 - 110) * 20)
    assert p["source"] == "manual"


def test_partial_sell_keeps_average_cost(fake_sb):
    fill(fake_sb, "buy", 10, 100)
    fill(fake_sb, "sell", 4, 130)
    p = pos(fake_sb)
    assert p["quantity"] == 6 and p["average_cost"] == 100 and p["status"] == "open"
    assert p["unrealized_pnl"] == pytest.approx(180)


def test_selling_everything_closes_position(fake_sb):
    fill(fake_sb, "buy", 10, 100)
    fill(fake_sb, "sell", 10, 90)
    p = pos(fake_sb)
    assert p["quantity"] == 0 and p["status"] == "closed" and p["position_value"] == 0


def test_overselling_never_goes_negative(fake_sb):
    fill(fake_sb, "buy", 5, 100)
    fill(fake_sb, "sell", 50, 100)
    assert pos(fake_sb)["quantity"] == 0


def test_manual_source_survives_broker_fill(fake_sb):
    fill(fake_sb, "buy", 10, 100, source="manual")
    fill(fake_sb, "buy", 5, 100, source="jarvis")
    assert pos(fake_sb)["source"] == "manual"


def test_symbols_are_normalised_and_separate(fake_sb):
    fill(fake_sb, "buy", 1, 10, symbol=" voo ")
    fill(fake_sb, "buy", 1, 10, symbol="QQQ")
    assert {r["symbol"] for r in fake_sb.rows("advisor_positions")} == {"VOO", "QQQ"}


@pytest.mark.parametrize("qty,price,symbol,action", [
    (0, 100, "VOO", "buy"), (-1, 100, "VOO", "buy"), (1, 0, "VOO", "buy"), (1, 100, "  ", "buy"),
    (1, 100, "VOO", "short"),
])
def test_invalid_fills_are_rejected(fake_sb, qty, price, symbol, action):
    assert update_position_from_fill(fake_sb, U, symbol, action, qty, price) is None
    assert fake_sb.rows("advisor_positions") == []


def test_no_supabase_returns_none():
    assert update_position_from_fill(None, U, "VOO", "buy", 1, 1) is None
