import re

with open('c:/Users/Rafael/workspace/repos/payday-planner/backend/app/api/routes_chat.py', 'r') as f:
    content = f.read()

# Modify litellm.acompletion
content = content.replace(
    'stream=True,\n                tools=export_tools\n            )',
    'stream=True,\n                stream_options={"include_usage": True},\n                tools=export_tools\n            )'
)

# Modify usage logging. Wait, chunk needs to be accessible, let's keep track of last chunk or we can just access chunk since it's the loop variable.
# In Python, loop variables persist after the loop. Let's check chunk.usage.
# Find the end of sync for chunk in response: loop.
# The loop ends at if full_response_content:
# So we can insert the usage check before if full_response_content: or after the loop.

replacement = '''            
            if hasattr(chunk, "usage") and chunk.usage:
                import json
                yield f"data: {json.dumps({'type': 'usage', 'prompt_tokens': chunk.usage.prompt_tokens, 'completion_tokens': chunk.usage.completion_tokens, 'total_tokens': chunk.usage.total_tokens, 'model': model_name})}\\\\n\\\\n"

            if full_response_content:'''

content = content.replace('            if full_response_content:', replacement)

with open('c:/Users/Rafael/workspace/repos/payday-planner/backend/app/api/routes_chat.py', 'w') as f:
    f.write(content)
print("Updated routes_chat.py")
