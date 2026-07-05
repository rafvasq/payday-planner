# models.py — Data models for Payday

from dataclasses import dataclass, field
from typing import Optional, List


@dataclass
class Member:
    id: str
    name: str


@dataclass
class Account:
    id: str
    name: str
    type: str          # chequing | savings | debt | investment | liability
    owner: str         # A | B | Joint
    balance: float = 0.0
    interest_rate: float = 0.0
    notes: str = ""
    market_value: float = 0.0  # for liability accounts: estimated sale value of the asset


@dataclass
class Event:
    id: str
    name: str
    event_type: str                  # inflow | outflow | transfer
    amount: float
    from_account_id: Optional[str]   # None for inflows
    to_account_id: Optional[str]     # None for pure outflows
    frequency: str                   # one-time | weekly | biweekly | biweekly-offset | monthly | quarterly
    anchor_date: str                 # ISO date — all future dates derived from this
    end_date: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    notes: str = ""
    active: bool = True


@dataclass
class Goal:
    id: str
    name: str
    account_id: str
    target_balance: float
    target_date: str
    notes: str = ""
