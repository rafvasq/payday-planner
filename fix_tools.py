with open('c:/Users/Rafael/workspace/repos/payday-planner/src/core/tools.ts', 'r') as f:
    content = f.read()

# Add import if missing
if "import { getOccurrences } from './calendar';" not in content:
    content = "import { getOccurrences } from './calendar';\n" + content

# In applyChangesToBlueprint, add pause_event logic
# It currently has:
'''
    if (c.type === 'skip_event') {
      executedEventsOverrides[${c.date}_] = true;
    } else if (c.type === 'set_amount') {
'''
replacement = '''
    if (c.type === 'skip_event') {
      executedEventsOverrides[${c.date}_] = true;
    } else if (c.type === 'pause_event') {
      const ev = newEvents.find(e => e.id === c.event_id);
      if (ev) {
        const occurrences = getOccurrences(ev, c.from_date, c.to_date);
        for (const date of occurrences) {
          executedEventsOverrides[${date}_] = true;
        }
      }
    } else if (c.type === 'set_amount') {
'''

# use replace but dynamically to be safe
content = content.replace("    if (c.type === 'skip_event') {\n      executedEventsOverrides[${c.date}_] = true;\n    } else if (c.type === 'set_amount') {", replacement.strip('\n'))

with open('c:/Users/Rafael/workspace/repos/payday-planner/src/core/tools.ts', 'w') as f:
    f.write(content)
