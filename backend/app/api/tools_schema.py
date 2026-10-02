change_item_schema = {
    "anyOf": [
        {
            "type": "object",
            "properties": {
                "type": {"type": "string", "enum": ["skip_event"]},
                "event_id": {"type": "string"},
                "date": {"type": "string"}
            },
            "required": ["type", "event_id", "date"]
        },
        {
            "type": "object",
            "properties": {
                "type": {"type": "string", "enum": ["pause_event"]},
                "event_id": {"type": "string"},
                "from_date": {"type": "string"},
                "to_date": {"type": "string"}
            },
            "required": ["type", "event_id", "from_date", "to_date"]
        },
        {
            "type": "object",
            "properties": {
                "type": {"type": "string", "enum": ["move_event"]},
                "event_id": {"type": "string"},
                "from_date": {"type": "string"},
                "to_date": {"type": "string"}
            },
            "required": ["type", "event_id", "from_date", "to_date"]
        },
        {
            "type": "object",
            "properties": {
                "type": {"type": "string", "enum": ["set_amount"]},
                "event_id": {"type": "string"},
                "amount_cents": {"type": "integer"}
            },
            "required": ["type", "event_id", "amount_cents"]
        },
        {
            "type": "object",
            "properties": {
                "type": {"type": "string", "enum": ["pay_debt"]},
                "card_id": {"type": "string"},
                "from_account_id": {"type": "string"},
                "amount_cents": {"type": "integer"},
                "date": {"type": "string"}
            },
            "required": ["type", "card_id", "from_account_id", "amount_cents", "date"]
        },
        {
            "type": "object",
            "properties": {
                "type": {"type": "string", "enum": ["add_one_time"]},
                "from_account_id": {"type": "string"},
                "to_account_id": {"type": "string"},
                "amount_cents": {"type": "integer"},
                "date": {"type": "string"}
            },
            "required": ["type", "from_account_id", "amount_cents", "date"]
        }
    ]
}

export_tools = [
    {
        "type": "function",
        "function": {
            "name": "simulate",
            "description": "Simulate a set of blueprint changes to see the resulting balance changes and watermarks without affecting the real plan. Acts as a scratchpad.",
            "parameters": {
                "type": "object",
                "properties": {
                    "changes": {
                        "type": "array",
                        "items": change_item_schema
                    }
                },
                "required": ["changes"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "propose_blueprint_changes",
            "description": "Propose a finalized set of changes to the user's blueprint. Triggers the UI to let the user review and apply. Use this only once per turn to conclude.",
            "parameters": {
                "type": "object",
                "properties": {
                    "changes": {
                        "type": "array",
                        "items": change_item_schema
                    }
                },
                "required": ["changes"]
            }
        }
    }
]
