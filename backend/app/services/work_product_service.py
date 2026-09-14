from __future__ import annotations

from typing import Any, Mapping


WORK_PRODUCTS = frozenset({"driver", "courier"})


def normalize_work_product(value: Any) -> str | None:
    normalized = str(value or "").strip().lower()
    return normalized if normalized in WORK_PRODUCTS else None


def active_work_mode(user: Mapping[str, Any]) -> str | None:
    return normalize_work_product(user.get("role"))


def approved_work_products(user: Mapping[str, Any]) -> list[str]:
    products = {
        normalized
        for value in (user.get("work_products") or [])
        if (normalized := normalize_work_product(value)) is not None
    }
    current = active_work_mode(user)
    if current:
        products.add(current)
    return sorted(products)


def with_approved_work_product(user: Mapping[str, Any], product: str) -> list[str]:
    normalized = normalize_work_product(product)
    if not normalized:
        raise ValueError("Unsupported work product.")
    products = set(approved_work_products(user))
    products.add(normalized)
    return sorted(products)
