# models.py — Data models for Payday

from dataclasses import dataclass
from typing import Optional


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
    market_value: float = 0.0  # for liability accounts: estimated sale value of the asset
    target_floor: Optional[float] = None        # minimum balance to keep in this account
    sweep_ceiling: Optional[float] = None       # balance above which surplus is safe to sweep out
    sweep_role: Optional[str] = None            # buffer | restricted — sweep eligibility
    statement_close_date: Optional[str] = None  # debt accounts: ISO date
    payment_due_date: Optional[str] = None      # debt accounts: ISO date


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
    notes: str = ""
    active: bool = True
    execution: str = "auto"          # auto (bank moves it on its own) | manual (you make the transfer)
    weekend_shift: str = "none"      # none | previous_business_day | next_business_day
