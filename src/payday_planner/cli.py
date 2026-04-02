import sys
from importlib.resources import files


def main():
    from streamlit.web import cli as stcli

    app_path = str(files("payday_planner").joinpath("app.py"))
    sys.argv = [
        "streamlit", "run", app_path,
        "--theme.base=light",
        "--theme.primaryColor=#4078F2",
        "--theme.backgroundColor=#FAFAFA",
        "--theme.secondaryBackgroundColor=#F0F2F7",
        "--theme.textColor=#383A42",
    ] + sys.argv[1:]
    sys.exit(stcli.main())
