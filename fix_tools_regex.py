import re
with open('c:/Users/Rafael/workspace/repos/payday-planner/src/core/tools.ts', 'r') as f:
    content = f.read()

pattern = r"(if \(c\.type === 'skip_event'\) \{[^}]+\}\s*)else if \(c\.type === 'set_amount'\) \{"
replacement = r"\1else if (c.type === 'pause_event') {\n      const ev = newEvents.find(e => e.id === c.event_id);\n      if (ev) {\n        const occurrences = getOccurrences(ev, c.from_date, c.to_date);\n        for (const date of occurrences) {\n          executedEventsOverrides[${date}_] = true;\n        }\n      }\n    } else if (c.type === 'set_amount') {"

content = re.sub(pattern, replacement, content)

with open('c:/Users/Rafael/workspace/repos/payday-planner/src/core/tools.ts', 'w') as f:
    f.write(content)
