from mellea import generative

try:
    @generative
    def _extract1(data: str) -> str:
        pass
    print("Just data is allowed")
except Exception as e:
    print(e)

