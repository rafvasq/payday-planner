import litellm
import os
os.environ["GEMINI_API_KEY"] = "dummy"
try:
    litellm.completion(model="gemini/gemini-2.5-flash", messages=[{"role": "user", "content": "hi"}], max_tokens=1)
    print("success")
except Exception as e:
    print(type(e).__name__)

