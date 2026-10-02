from mellea import generative, start_session

@generative
def _extract(data: str) -> str:
    pass

session = start_session(backend_name="litellm", model_id="dummy")
try:
    _extract(data="hi", m=session)
except Exception as e:
    print(e)

