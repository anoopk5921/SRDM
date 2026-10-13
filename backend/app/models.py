from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Company(Base):
    __tablename__ = "company_master"

    company_code: Mapped[str] = mapped_column(String(50), primary_key=True)
    company_name: Mapped[str] = mapped_column(String(200), nullable=False)


class Employee(Base):
    __tablename__ = "EmployeeMaster"

    employee_id: Mapped[str] = mapped_column("EmployeeId", String(50), primary_key=True)
    employee_name: Mapped[str] = mapped_column("EmployeeName", String(200), nullable=False)
    department: Mapped[str] = mapped_column("Department", String(100), nullable=False)
    mobile: Mapped[str] = mapped_column("Mobile", String(20), nullable=False)
    company_code: Mapped[str] = mapped_column(
        "CompanyCode",
        String(50),
        ForeignKey("company_master.company_code"),
        nullable=False,
    )
    allowed_strength: Mapped[int] = mapped_column("AllowedStrength", Integer, nullable=False)


class JoinEvent(Base):
    __tablename__ = "Joinevents"

    unique_event_id: Mapped[int] = mapped_column("UniqueEventId", BigInteger, primary_key=True, autoincrement=True)
    employee_id: Mapped[str | None] = mapped_column(
        "EmployeeId",
        String(50),
        ForeignKey("EmployeeMaster.EmployeeId"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column("Name", String(200), nullable=False)
    relation: Mapped[str] = mapped_column("Relation", String(20), nullable=False)
    department: Mapped[str] = mapped_column("Department", String(100), nullable=False, default="")
    employee_name: Mapped[str] = mapped_column("EmployeeName", String(200), nullable=False, default="")
    company: Mapped[str] = mapped_column("Company", String(50), nullable=False, default="")
    category: Mapped[str] = mapped_column(
        "Category",
        String(20),
        nullable=False,
        default="Registered",
        server_default="Registered",
    )
    admission_group: Mapped[str] = mapped_column(
        "AdmissionGroup",
        String(20),
        nullable=False,
        default="Employee",
        server_default="Employee",
    )
    approve_status: Mapped[str] = mapped_column(
        "ApproveStatus",
        String(20),
        nullable=False,
        default="Pending",
        server_default="Pending",
    )
    print_status: Mapped[str] = mapped_column(
        "PrintStatus",
        String(20),
        nullable=False,
        default="Pending",
        server_default="Pending",
    )
    join_status: Mapped[str] = mapped_column(
        "JoinStatus",
        String(20),
        nullable=False,
        default="Pending",
        server_default="Pending",
    )
    meals_status: Mapped[str] = mapped_column(
        "MealsStatus",
        String(20),
        nullable=False,
        default="Pending",
        server_default="Pending",
    )
    report_issue: Mapped[str] = mapped_column(
        "ReportIssue",
        String(50),
        nullable=False,
        default="",
        server_default="",
    )
    event: Mapped[str] = mapped_column(
        "Event",
        String(100),
        nullable=False,
        default="Annual Day 2026",
        server_default="Annual Day 2026",
    )
    event_year: Mapped[int] = mapped_column(
        "EventYear",
        Integer,
        nullable=False,
        default=2026,
        server_default="2026",
    )
    unregistered_number: Mapped[str] = mapped_column(
        "UnregisteredNumber",
        String(20),
        nullable=False,
        default="",
        server_default="",
    )


class JoinChild(Base):
    __tablename__ = "JoinChild"

    employee_id: Mapped[str] = mapped_column("EmployeeId", String(50), primary_key=True)
    kids_number: Mapped[int] = mapped_column("KidsNumber", Integer, nullable=False)


class Category(Base):
    __tablename__ = "Category"

    id: Mapped[int] = mapped_column("Id", Integer, primary_key=True, autoincrement=True)
    guest_category: Mapped[str] = mapped_column("GuestCategory", String(100), nullable=False)
    prefix_number: Mapped[int] = mapped_column("PrefixNumber", Integer, nullable=False)


class DeletionLog(Base):
    __tablename__ = "DeletionLog"

    id: Mapped[int] = mapped_column("Id", Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column("CreatedAt", DateTime, nullable=False)
    ip_address: Mapped[str] = mapped_column("IpAddress", String(45), nullable=False, default="")
    username: Mapped[str] = mapped_column("Username", String(50), nullable=False, default="")
    action: Mapped[str] = mapped_column("Action", String(80), nullable=False)
    detail: Mapped[str] = mapped_column("Detail", String(500), nullable=False, default="")


class Department(Base):
    __tablename__ = "Department"

    department: Mapped[str] = mapped_column("Department", String(100), primary_key=True)
    company_code: Mapped[str] = mapped_column(
        "CompanyCode",
        String(50),
        ForeignKey("company_master.company_code"),
        primary_key=True,
    )
    password: Mapped[str] = mapped_column("Password", String(50), nullable=False)
