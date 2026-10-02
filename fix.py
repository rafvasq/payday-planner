with open('c:/Users/Rafael/workspace/repos/payday-planner/backend/app/api/routes_chat.py', 'r') as f:
    content = f.read()

content = content.replace('\\\\n\\\\n', '\\n\\n')

with open('c:/Users/Rafael/workspace/repos/payday-planner/backend/app/api/routes_chat.py', 'w') as f:
    f.write(content)
