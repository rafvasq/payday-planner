with open('c:/Users/Rafael/workspace/repos/payday-planner/backend/app/api/routes_chat.py', 'r') as f:
    content = f.read()

content = content.replace(
    'delta = chunk.choices[0].delta',
    'if not chunk.choices:\n                    continue\n                delta = chunk.choices[0].delta'
)

with open('c:/Users/Rafael/workspace/repos/payday-planner/backend/app/api/routes_chat.py', 'w') as f:
    f.write(content)
