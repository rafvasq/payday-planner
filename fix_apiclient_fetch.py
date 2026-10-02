import re
with open('c:/Users/Rafael/workspace/repos/payday-planner/src/lib/apiClient.ts', 'r') as f:
    content = f.read()

# I will use a more robust regex to replace the fetch call inside chatStream
# We are looking for the fetch call and appending signal
pattern = r'(body:\s*JSON\.stringify\(\{\s*messages,\s*blueprint,\s*ledger_context,\s*spending_summary,\s*provider\s*\}\))(\s*\})'
replacement = r'\1,\n      signal\2'

content = re.sub(pattern, replacement, content)

with open('c:/Users/Rafael/workspace/repos/payday-planner/src/lib/apiClient.ts', 'w') as f:
    f.write(content)
