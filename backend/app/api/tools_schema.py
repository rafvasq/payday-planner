date_prop = {"type": "string", "description": "YYYY-MM-DD, today or later"}

change_item_schema = {
    "anyOf": [
        {
            "type": "object",
            "description": "Skip a single occurrence of a recurring event.",
            "properties": {
                "type": {"type": "string", "enum": ["skip_event"]},
                "event_id": {"type": "string"},
                "date": date_prop,
            },
            "required": ["type", "event_id", "date"],
        },
        {
            "type": "object",
            "description": "Skip every occurrence of an event between two dates (inclusive).",
            "properties": {
                "type": {"type": "string", "enum": ["pause_event"]},
                "event_id": {"type": "string"},
                "from_date": date_prop,
                "to_date": date_prop,
            },
            "required": ["type", "event_id", "from_date", "to_date"],
        },
        {
            "type": "object",
            "description": "Move one occurrence of an event to another date.",
            "properties": {
                "type": {"type": "string", "enum": ["move_event"]},
                "event_id": {"type": "string"},
                "from_date": date_prop,
                "to_date": date_prop,
            },
            "required": ["type", "event_id", "from_date", "to_date"],
        },
        {
            "type": "object",
            "description": "Change the amount of an event (all occurrences).",
            "properties": {
                "type": {"type": "string", "enum": ["set_amount"]},
                "event_id": {"type": "string"},
                "amount_cents": {"type": "integer"},
            },
            "required": ["type", "event_id", "amount_cents"],
        },
        {
            "type": "object",
            "description": "One-off payment toward a credit card / debt account.",
            "properties": {
                "type": {"type": "string", "enum": ["pay_debt"]},
                "card_id": {"type": "string"},
                "from_account_id": {"type": "string"},
                "amount_cents": {"type": "integer"},
                "date": date_prop,
                "name": {"type": "string"},
            },
            "required": ["type", "card_id", "from_account_id", "amount_cents", "date"],
        },
        {
            "type": "object",
            "description": "A future one-off transfer (with to_account_id) or expense (without). Not for things that already happened — use record_actual for those.",
            "properties": {
                "type": {"type": "string", "enum": ["add_one_time"]},
                "from_account_id": {"type": "string"},
                "to_account_id": {"type": "string"},
                "amount_cents": {"type": "integer"},
                "date": date_prop,
                "name": {"type": "string"},
            },
            "required": ["type", "from_account_id", "amount_cents", "date"],
        },
    ]
}

export_tools = [
    {
        "type": "function",
        "function": {
            "name": "get_snapshot",
            "description": "Read the current state from the projection engine: every account balance, floor, headroom, and the 30-day outlook (lowest balance and date, first floor breach, first overdraft, recovery). Includes any active scenario assumptions. Call this instead of computing balances yourself.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_schedule",
            "description": "List dated cash moves between two dates (default: today to 7 days out), expanded from the recurring rules by the engine, with each event's status and the end-of-day balance of the accounts it touches. Use for \"what's coming up / this week / before payday\" questions. Never expand recurrences yourself.",
            "parameters": {
                "type": "object",
                "properties": {
                    "from_date": date_prop,
                    "to_date": {"type": "string", "description": "YYYY-MM-DD, at most 62 days out"},
                    "account_id": {"type": "string", "description": "Optional: only events touching this account"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "simulate",
            "description": "Sandbox: test hypothetical future changes and get engine-computed before/after outlooks per account. Nothing is saved. Must contain at least one change. Give the scenario a short human label.",
            "parameters": {
                "type": "object",
                "properties": {
                    "label": {"type": "string", "description": "Short scenario name, e.g. \"Skip vault sweeps Oct 15\""},
                    "changes": {
                        "type": "array",
                        "minItems": 1,
                        "items": change_item_schema,
                    },
                },
                "required": ["label", "changes"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "propose_blueprint_changes",
            "description": "Propose a finalized set of plan changes. The user sees a review card with Apply / Reject. Only after you have simulated them in an earlier turn. Ends your turn.",
            "parameters": {
                "type": "object",
                "properties": {
                    "label": {"type": "string"},
                    "changes": {
                        "type": "array",
                        "minItems": 1,
                        "items": change_item_schema,
                    },
                },
                "required": ["label", "changes"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "record_actual",
            "description": "Use when the user says a transaction ALREADY happened (a transfer made, bill paid, deposit received). Shows the user a card asking whether to update saved balances, treat it as landed for this conversation only, or note it is already in their balances. Never assume which; ends your turn.",
            "parameters": {
                "type": "object",
                "properties": {
                    "description": {"type": "string", "description": "Short human description, e.g. \"Transfer R Chequing → EQ Hub\""},
                    "transactions": {
                        "type": "array",
                        "minItems": 1,
                        "items": {
                            "type": "object",
                            "properties": {
                                "from_account_id": {"type": "string", "description": "Account money left (omit for deposits)"},
                                "to_account_id": {"type": "string", "description": "Account money arrived in (omit for expenses)"},
                                "amount_cents": {"type": "integer"},
                                "date": {"type": "string", "description": "YYYY-MM-DD when it happened (today or earlier)"},
                            },
                            "required": ["amount_cents"],
                        },
                    },
                },
                "required": ["description", "transactions"],
            },
        },
    },
]
