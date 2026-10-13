import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


class Settings:
    db_host: str = os.getenv("DB_HOST", "127.0.0.1")
    db_port: int = int(os.getenv("DB_PORT", "3306"))
    db_user: str = os.getenv("DB_USER", "root")
    db_password: str = os.getenv("DB_PASSWORD", "")
    db_name: str = os.getenv("DB_NAME", "SRDM")
    app_username: str = os.getenv("APP_USERNAME", "hrdept")
    app_password: str = os.getenv("APP_PASSWORD", "hr2026")
    admin_passkey: str = os.getenv("ADMIN_PASSKEY", "9447115921")
    session_secret: str = os.getenv("SESSION_SECRET", "srdm-annual-day-2026-session")


settings = Settings()
