# SRDM

Company master:

- React (Vite) for the interface
- Python (FastAPI) for the API
- MariaDB for storage

MariaDB is expected on this machine (the Windows service). Docker is not required.

## 1. Point the API at MariaDB

Edit `backend/.env` and set `DB_PASSWORD` to the MariaDB account password. The default user is `root`, and the database name is `SRDM`. On startup the API creates `company_master` in that database and loads SAEH, MEDICINES, CLINICS, and R&D.

## 2. Start the API

```powershell
cd D:\SRDM\backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

If the virtual environment is missing:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## 3. Start the UI

```powershell
cd D:\SRDM\frontend
npm install
npm run dev
```

Open http://localhost:5173

The API is also available at http://127.0.0.1:8000/docs
