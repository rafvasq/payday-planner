with open('c:/Users/Rafael/workspace/repos/payday-planner/src/core/tools.ts', 'r') as f:
    content = f.read()

target = '''    if (c.type === 'skip_event') {
      executedEventsOverrides[${c.date}_] = true;
    } else if (c.type === 'set_amount') {'''

replacement = '''    if (c.type === 'skip_event') {
      executedEventsOverrides[${c.date}_] = true;
    } else if (c.type === 'pause_event') {
      const ev = newEvents.find(e => e.id === c.event_id);
      if (ev) {
        const occurrences = getOccurrences(ev, c.from_date, c.to_date);
        for (const date of occurrences) {
          executedEventsOverrides[${date}_] = true;
        }
      }
    } else if (c.type === 'set_amount') {'''

if target in content:
    content = content.replace(target, replacement)
    with open('c:/Users/Rafael/workspace/repos/payday-planner/src/core/tools.ts', 'w') as f:
        f.write(content)
    print("Replaced successfully")
else:
    print("Target not found")
