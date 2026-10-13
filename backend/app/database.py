from urllib.parse import quote_plus

from fastapi import HTTPException
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.models import Base, Category, Company, Department

engine = None
SessionLocal = None
connection_error: str | None = None

COMPANIES = [
    ("SAEH", "SAEH"),
    ("MEDICINES", "MEDICINES"),
    ("CLINICS", "CLINICS"),
    ("R&D", "R&D"),
]


def _server_url() -> str:
    user = quote_plus(settings.db_user)
    password = quote_plus(settings.db_password)
    return f"mysql+pymysql://{user}:{password}@{settings.db_host}:{settings.db_port}/"


def _database_url() -> str:
    user = quote_plus(settings.db_user)
    password = quote_plus(settings.db_password)
    return (
        f"mysql+pymysql://{user}:{password}@{settings.db_host}:{settings.db_port}/"
        f"{settings.db_name}?charset=utf8mb4"
    )


def _friendly_error(exc: Exception) -> str:
    message = str(exc)
    if "Access denied" in message:
        return (
            "MariaDB refused the login in backend/.env. "
            "Set DB_USER and DB_PASSWORD, then restart the API."
        )
    if "Can't connect" in message or "Connection refused" in message:
        return "The API could not reach MariaDB. Confirm the server is running on DB_HOST and DB_PORT."
    return message


def init_database() -> None:
    global engine, SessionLocal, connection_error

    if not settings.db_name.isidentifier():
        connection_error = "DB_NAME may only contain letters, numbers, and underscores."
        return

    try:
        server = create_engine(_server_url(), pool_pre_ping=True)
        with server.connect() as connection:
            connection.execute(
                text(
                    f"CREATE DATABASE IF NOT EXISTS `{settings.db_name}` "
                    "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
                )
            )
            connection.commit()
        server.dispose()

        engine = create_engine(_database_url(), pool_pre_ping=True)
        SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
        Base.metadata.create_all(bind=engine)
        _prepare_join_events()
        _seed_companies()
        _seed_departments()
        _seed_categories()
        connection_error = None
    except Exception as exc:
        engine = None
        SessionLocal = None
        connection_error = _friendly_error(exc)


def _prepare_join_events() -> None:
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE `Joinevents` AUTO_INCREMENT = 1000000000"))
        connection.execute(
            text(
                "ALTER TABLE `Joinevents` "
                "ADD COLUMN IF NOT EXISTS `ApproveStatus` VARCHAR(20) NOT NULL DEFAULT 'Pending'"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE `Joinevents` "
                "ADD COLUMN IF NOT EXISTS `PrintStatus` VARCHAR(20) NOT NULL DEFAULT 'Pending'"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE `Joinevents` "
                "ADD COLUMN IF NOT EXISTS `JoinStatus` VARCHAR(20) NOT NULL DEFAULT 'Pending'"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE `Joinevents` "
                "ADD COLUMN IF NOT EXISTS `MealsStatus` VARCHAR(20) NOT NULL DEFAULT 'Pending'"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE `Joinevents` "
                "ADD COLUMN IF NOT EXISTS `ReportIssue` VARCHAR(50) NOT NULL DEFAULT ''"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE `Joinevents` "
                "ADD COLUMN IF NOT EXISTS `Event` VARCHAR(100) NOT NULL DEFAULT 'Annual Day 2026'"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE `Joinevents` "
                "ADD COLUMN IF NOT EXISTS `EventYear` INT NOT NULL DEFAULT 2026"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE `Joinevents` "
                "ADD COLUMN IF NOT EXISTS `Category` VARCHAR(20) NOT NULL DEFAULT 'Registered'"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE `Joinevents` "
                "ADD COLUMN IF NOT EXISTS `AdmissionGroup` VARCHAR(20) NOT NULL DEFAULT 'Employee'"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE `Joinevents` "
                "ADD COLUMN IF NOT EXISTS `Department` VARCHAR(100) NOT NULL DEFAULT ''"
            )
        )
        connection.execute(
            text(
                "UPDATE `Joinevents` AS event "
                "JOIN `EmployeeMaster` AS employee ON event.`EmployeeId` = employee.`EmployeeId` "
                "SET event.`Department` = employee.`Department` "
                "WHERE event.`Department` = ''"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE `Joinevents` "
                "ADD COLUMN IF NOT EXISTS `Company` VARCHAR(50) NOT NULL DEFAULT ''"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE `Joinevents` "
                "ADD COLUMN IF NOT EXISTS `EmployeeName` VARCHAR(200) NOT NULL DEFAULT ''"
            )
        )
        connection.execute(text("ALTER TABLE `Joinevents` MODIFY `EmployeeId` VARCHAR(50) NULL"))
        has_company_code = connection.execute(
            text(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Joinevents' "
                "AND COLUMN_NAME = 'CompanyCode'"
            )
        ).scalar()
        if has_company_code:
            connection.execute(
                text("UPDATE `Joinevents` SET `Company` = `CompanyCode` WHERE `Company` = ''")
            )
            connection.execute(text("ALTER TABLE `Joinevents` DROP COLUMN `CompanyCode`"))
        connection.execute(
            text(
                "UPDATE `Joinevents` AS event "
                "JOIN `EmployeeMaster` AS employee ON event.`EmployeeId` = employee.`EmployeeId` "
                "SET event.`EmployeeName` = employee.`EmployeeName` "
                "WHERE event.`EmployeeName` = ''"
            )
        )
        connection.execute(
            text(
                "UPDATE `Joinevents` AS event "
                "JOIN `EmployeeMaster` AS employee ON event.`EmployeeId` = employee.`EmployeeId` "
                "SET event.`Company` = employee.`CompanyCode` "
                "WHERE event.`Company` = ''"
            )
        )
        foreign_keys = list(
            connection.execute(
                text(
                    "SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS "
                    "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'JoinChild' "
                    "AND CONSTRAINT_TYPE = 'FOREIGN KEY'"
                )
            ).scalars()
        )
        for constraint_name in foreign_keys:
            connection.execute(text(f"ALTER TABLE `JoinChild` DROP FOREIGN KEY `{constraint_name}`"))
        connection.execute(text("ALTER TABLE `Joinevents` DROP COLUMN IF EXISTS `Age`"))
        connection.execute(
            text("UPDATE `Joinevents` SET `Relation` = 'Employee' WHERE `Relation` = 'Self'")
        )
        connection.execute(
            text(
                "ALTER TABLE `Joinevents` "
                "ADD COLUMN IF NOT EXISTS `UnregisteredNumber` VARCHAR(20) NOT NULL DEFAULT ''"
            )
        )
    _backfill_unregistered_numbers()


def _backfill_unregistered_numbers() -> None:
    from app.unregistered_number import assign_missing_unregistered_numbers, hold_unregistered_number

    with SessionLocal() as session:
        with hold_unregistered_number(session):
            assign_missing_unregistered_numbers(session)
            session.commit()


CATEGORIES = [
    ("Guest", 0),
    ("Guest-P", 0),
    ("Guest-S", 0),
    ("Guest-C", 0),
]


def _rename_category(by_name: dict, old: str, new: str, session) -> None:
    if old not in by_name:
        return
    if new not in by_name:
        by_name[old].guest_category = new
        by_name[new] = by_name.pop(old)
        return
    session.delete(by_name.pop(old))


def _seed_categories() -> None:
    with SessionLocal() as session:
        rows = session.scalars(select(Category)).all()
        by_name = {row.guest_category: row for row in rows}
        _rename_category(by_name, "Patient", "Guest-P", session)
        _rename_category(by_name, "Security", "Guest-S", session)
        _rename_category(by_name, "Contract Employee", "Guest-C", session)
        if "Bystander" in by_name:
            session.delete(by_name["Bystander"])
        session.flush()
        existing = set(session.scalars(select(Category.guest_category)).all())
        for guest_category, prefix_number in CATEGORIES:
            if guest_category not in existing:
                session.add(Category(guest_category=guest_category, prefix_number=prefix_number))
        session.commit()


def _seed_companies() -> None:
    with SessionLocal() as session:
        existing_codes = set(session.scalars(select(Company.company_code)).all())
        for code, name in COMPANIES:
            if code not in existing_codes:
                session.add(Company(company_code=code, company_name=name))
        session.commit()


DEPARTMENTS = [
    ("Director Board", "SAEH", "abc123"),
    ("IT", "SAEH", "abc124"),
    ("Medical", "SAEH", "abc125"),
    ("Hospital Finance", "SAEH", "abc126"),
    ("Patient Services", "SAEH", "abc127"),
    ("Data Entry", "SAEH", "abc128"),
    ("Patient Relations", "SAEH", "abc129"),
    ("Administration", "SAEH", "abc130"),
    ("OP office", "SAEH", "abc131"),
    ("CMO office", "SAEH", "abc132"),
    ("Maintenance", "SAEH", "abc133"),
    ("Public Relations", "SAEH", "abc134"),
    ("Front Office", "SAEH", "abc135"),
    ("HR", "SAEH", "abc136"),
    ("Holistic health", "SAEH", "abc137"),
    ("Corporate Finance", "SAEH", "abc138"),
    ("Stores", "SAEH", "abc139"),
    ("IMMU", "SAEH", "abc140"),
    ("Operations", "SAEH", "abc141"),
    ("Villa", "SAEH", "abc142"),
    ("Laundry", "SAEH", "abc143"),
    ("Pharmacy", "SAEH", "abc144"),
    ("Veg Food Court", "SAEH", "abc145"),
    ("House Keeping", "SAEH", "abc146"),
    ("Learning Academy", "SAEH", "abc147"),
    ("Optical shop", "SAEH", "abc148"),
    ("Dairy Farm", "SAEH", "abc149"),
    ("CEO office", "SAEH", "abc150"),
    ("Pathology", "SAEH", "abc151"),
    ("Director Board", "MEDICINES", "abc152"),
    ("Finance & Accounts", "MEDICINES", "abc153"),
    ("Purchase", "MEDICINES", "abc154"),
    ("Administration", "MEDICINES", "abc155"),
    ("Production", "MEDICINES", "abc156"),
    ("R M Store", "MEDICINES", "abc157"),
    ("Shop", "MEDICINES", "abc158"),
    ("QC Lab", "MEDICINES", "abc159"),
    ("Maintenance", "MEDICINES", "abc160"),
    ("Sales & Marketing", "MEDICINES", "abc161"),
    ("Marketing Office", "MEDICINES", "abc162"),
    ("House Keeping", "MEDICINES", "abc163"),
    ("P M Store", "MEDICINES", "abc164"),
    ("F G Store", "MEDICINES", "abc165"),
    ("Boiler", "MEDICINES", "abc166"),
    ("Operations", "MEDICINES", "abc167"),
    ("Outside Kerala Marketi", "MEDICINES", "abc168"),
    ("Director Board", "CLINICS", "abc169"),
    ("Medical", "CLINICS", "abc170"),
    ("HR & Administration", "CLINICS", "abc171"),
    ("Pharmacy", "CLINICS", "abc172"),
    ("Marketing", "CLINICS", "abc173"),
    ("Operations", "CLINICS", "abc174"),
    ("Optometry", "CLINICS", "abc175"),
    ("Finance", "CLINICS", "abc176"),
    ("Front Office", "CLINICS", "abc177"),
    ("Administration", "CLINICS", "abc178"),
    ("Housekeeping", "CLINICS", "abc179"),
    ("Patient Relations", "CLINICS", "abc180"),
    ("CMO Office", "R&D", "abc181"),
    ("Pathology Lab", "R&D", "abc182"),
    ("Optometry", "R&D", "abc183"),
    ("Finance & Accounts", "R&D", "abc184"),
    ("Clinical Research", "R&D", "abc185"),
    ("Maintenance", "R&D", "abc186"),
    ("Medical", "R&D", "abc187"),
    ("Pharmacy", "R&D", "abc188"),
    ("Operations", "R&D", "abc189"),
]


def _seed_departments() -> None:
    with SessionLocal() as session:
        existing = {
            (row.department, row.company_code)
            for row in session.scalars(select(Department)).all()
        }
        for department, company_code, password in DEPARTMENTS:
            if (department, company_code) not in existing:
                session.add(
                    Department(department=department, company_code=company_code, password=password)
                )
        session.commit()


def get_db():
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail=connection_error or "Database is not connected")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
