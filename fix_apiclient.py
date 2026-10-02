with open('c:/Users/Rafael/workspace/repos/payday-planner/src/lib/apiClient.ts', 'r') as f:
    content = f.read()

# Update signature
old_sig = 'chatStream: async function* (messages: {role: string, content: string}[], blueprint: any, ledger_context: string, spending_summary?: string, provider?: string) {'
new_sig = 'chatStream: async function* (messages: {role: string, content: string}[], blueprint: any, ledger_context: string, spending_summary?: string, provider?: string, signal?: AbortSignal) {'
content = content.replace(old_sig, new_sig)

# Update fetch
old_fetch = '''const res = await fetch(${API_BASE}/chat, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "X-Local-Auth-Token": getLocalAuthToken() 
      },
      body: JSON.stringify({ messages, blueprint, ledger_context, spending_summary, provider })
    });'''
new_fetch = '''const res = await fetch(${API_BASE}/chat, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "X-Local-Auth-Token": getLocalAuthToken() 
      },
      body: JSON.stringify({ messages, blueprint, ledger_context, spending_summary, provider }),
      signal
    });'''
content = content.replace(old_fetch, new_fetch)

with open('c:/Users/Rafael/workspace/repos/payday-planner/src/lib/apiClient.ts', 'w') as f:
    f.write(content)
