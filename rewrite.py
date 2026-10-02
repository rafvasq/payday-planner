import json

with open('backend/app/api/routes_chat.py', 'r', encoding='utf-8') as f:
    code = f.read()

replacement = """
              if tool_calls_buffer:
                  import json
                  for tc in tool_calls_buffer.values():
                      if tc['function']['name'] == 'propose_blueprint_changes':
                          args_str = tc['function']['arguments']
                          has_simulated = False
                          try:
                              target_args = json.loads(args_str)
                              for m in payload.messages:
                                  if m.get('role') == 'assistant' and 'tool_calls' in m:
                                      for past_tc in m['tool_calls']:
                                          if past_tc.get('function', {}).get('name') == 'simulate':
                                              try:
                                                  past_args = json.loads(past_tc.get('function', {}).get('arguments', '{}'))
                                                  if past_args == target_args:
                                                      has_simulated = True
                                              except:
                                                  pass
                          except:
                              pass
                          
                          if not has_simulated:
                              logger.warning('Agent attempted to propose without simulating exactly. Rewriting to simulate.')
                              tc['function']['name'] = 'simulate'
                      
                      logger.info(f"AI Tool Call: {tc['function']['name']} args: {tc['function']['arguments']}")
                      yield f"data: {json.dumps({'type': 'tool_call', 'tool_call': tc})}\\n\\n"
"""

original = """
              if tool_calls_buffer:
                  import json
                  for tc in tool_calls_buffer.values():
                      logger.info(f"AI Tool Call: {tc['function']['name']} args: {tc['function']['arguments']}")
                      yield f"data: {json.dumps({'type': 'tool_call', 'tool_call': tc})}\\n\\n"
"""

code = code.replace(original, replacement)
with open('backend/app/api/routes_chat.py', 'w', encoding='utf-8') as f:
    f.write(code)
