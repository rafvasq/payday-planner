import httpx
import os
import asyncio

async def test_gemini():
    api_key = os.environ.get("GEMINI_API_KEY")
    url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
    async with httpx.AsyncClient() as client:
        res = await client.get(url)
        if res.status_code == 200:
            print("Gemini:", [m["name"] for m in res.json().get("models", [])])
        else:
            print("Gemini err:", res.text)

asyncio.run(test_gemini())

