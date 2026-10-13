from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CompanyCreate(BaseModel):
    company_code: str = Field(min_length=1, max_length=50)
    company_name: str = Field(min_length=1, max_length=200)

    @field_validator("company_code", "company_name")
    @classmethod
    def strip_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field is required")
        return value


class CompanyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    company_code: str
    company_name: str


class EmployeeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    employee_id: str
    employee_name: str
    department: str
    mobile: str
    company_code: str
    allowed_strength: int


class EmployeeStrengthUpdate(BaseModel):
    employee_id: str = Field(min_length=1, max_length=50)
    allowed_strength: int = Field(ge=0)

    @field_validator("employee_id")
    @classmethod
    def strip_employee_id(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Employee ID is required")
        return value


class EmployeeUploadResult(BaseModel):
    inserted: int
    updated: int


class EmployeeDeleteResult(BaseModel):
    deleted_employees: int
    deleted_events: int


RELATIONS = ("Employee", "Father", "Mother", "Wife", "Husband", "Daughter", "Son", "Brother", "Sister")


class FamilyMemberIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    relation: str

    @field_validator("name", "relation")
    @classmethod
    def strip_member_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field is required")
        return value

    @field_validator("relation")
    @classmethod
    def known_relation(cls, value: str) -> str:
        if value not in RELATIONS:
            raise ValueError("Choose a relation from the list")
        return value


class JoinEventCreate(BaseModel):
    employee_id: str = Field(min_length=1, max_length=50)
    members: list[FamilyMemberIn] = Field(default_factory=list)
    kids_number: int = Field(default=0, ge=0, le=99)

    @field_validator("employee_id")
    @classmethod
    def strip_employee_id(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Employee ID is required")
        return value

    @field_validator("kids_number", mode="before")
    @classmethod
    def blank_kids_number(cls, value):
        if value is None or (isinstance(value, str) and value.strip() == ""):
            return 0
        return value


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    guest_category: str
    prefix_number: int


class BulkRegistrationCreate(BaseModel):
    category_id: int = Field(ge=1)
    company_code: str = Field(min_length=1, max_length=50)
    department: str = Field(min_length=1, max_length=100)
    total_pass: int = Field(ge=1, le=500)

    @field_validator("company_code", "department")
    @classmethod
    def strip_bulk(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field is required")
        return value


class UnregisteredJoinCreate(BaseModel):
    employee_name: str = Field(min_length=1, max_length=200)
    department: str = Field(min_length=1, max_length=100)
    company_code: str = Field(min_length=1, max_length=50)
    members: list[FamilyMemberIn] = Field(default_factory=list, max_length=5)

    @field_validator("employee_name", "department", "company_code")
    @classmethod
    def strip_unregistered(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field is required")
        return value

    @field_validator("members")
    @classmethod
    def family_relations(cls, members: list[FamilyMemberIn]) -> list[FamilyMemberIn]:
        if any(member.relation == "Employee" for member in members):
            raise ValueError("Family members use a relation other than Employee")
        return members


class UnregisteredFamilyCreate(BaseModel):
    unregistered_number: str = Field(min_length=1, max_length=20)
    members: list[FamilyMemberIn] = Field(min_length=1, max_length=5)

    @field_validator("unregistered_number")
    @classmethod
    def normalize_number(cls, value: str) -> str:
        value = "".join(value.split()).upper()
        if len(value) < 3 or not value.startswith("UR") or not value[2:].isdigit():
            raise ValueError("Enter an unregistered number like UR1")
        return f"UR{int(value[2:])}"

    @field_validator("members")
    @classmethod
    def family_relations(cls, members: list[FamilyMemberIn]) -> list[FamilyMemberIn]:
        if any(member.relation == "Employee" for member in members):
            raise ValueError("Family members use a relation other than Employee")
        return members


class JoinChildOut(BaseModel):
    employee_id: str
    kids_number: int | None = None


class JoinEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    unique_event_id: int
    employee_id: str | None = None
    name: str
    relation: str
    department: str
    employee_name: str = ""
    company: str
    category: str
    admission_group: str
    approve_status: str
    print_status: str
    join_status: str
    meals_status: str
    unregistered_number: str = ""


class DepartmentOut(BaseModel):
    department: str
    company_code: str


class DepartmentMasterOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    department: str
    company_code: str
    password: str


class DepartmentCreate(BaseModel):
    company_code: str = Field(min_length=1, max_length=50)
    department: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=50)

    @field_validator("company_code", "department", "password")
    @classmethod
    def strip_department(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field is required")
        return value


class DepartmentPasswordUpdate(BaseModel):
    company_code: str = Field(min_length=1, max_length=50)
    department: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=50)

    @field_validator("company_code", "department", "password")
    @classmethod
    def strip_password(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field is required")
        return value


class AttendeeLogin(BaseModel):
    company_code: str = Field(min_length=1, max_length=50)
    department: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=50)

    @field_validator("company_code", "department", "password")
    @classmethod
    def strip_login(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field is required")
        return value


class AttendeeOut(BaseModel):
    unique_event_id: int
    employee_id: str
    employee_name: str
    department: str
    company_code: str
    name: str
    relation: str
    approve_status: str
    print_status: str
    unregistered_number: str = ""


class AttendeeApproveAll(AttendeeLogin):
    event_ids: list[int] = Field(min_length=1, max_length=50)


class AttendeeDecision(AttendeeLogin):
    approve_status: str

    @field_validator("approve_status")
    @classmethod
    def known_status(cls, value: str) -> str:
        if value not in ("Approved", "Rejected"):
            raise ValueError("Status must be Approved or Rejected")
        return value


class PassOut(BaseModel):
    unique_event_id: int
    employee_id: str
    employee_name: str
    department: str
    company_code: str
    company_name: str
    name: str
    relation: str
    approve_status: str
    print_status: str
    unregistered_number: str = ""


class PassPrintRequest(BaseModel):
    company_code: str = Field(min_length=1, max_length=50)
    department: str = Field(min_length=1, max_length=100)
    unique_event_ids: list[int] = Field(min_length=1)

    @field_validator("company_code", "department")
    @classmethod
    def strip_pass_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field is required")
        return value


class PassAllPrintRequest(BaseModel):
    company_code: str = ""
    unique_event_ids: list[int] = Field(min_length=1)

    @field_validator("company_code")
    @classmethod
    def strip_all_company(cls, value: str) -> str:
        return value.strip()


class GateEntry(BaseModel):
    joining_id: str = Field(min_length=1, max_length=20)

    @field_validator("joining_id")
    @classmethod
    def digits_only(cls, value: str) -> str:
        value = value.strip()
        if not value.isdigit():
            raise ValueError("Scan a valid joining id")
        return value


class GateEntryOut(BaseModel):
    unique_event_id: int
    employee_id: str
    employee_name: str
    department: str
    company_code: str
    company_name: str
    name: str
    relation: str
    join_status: str
    meals_status: str
    report_issue: str
    already_joined: bool
    already_served: bool


class ReportRow(BaseModel):
    unique_event_id: int
    employee_id: str
    employee_name: str
    department: str
    company_code: str
    company_name: str
    name: str
    relation: str
    approve_status: str
    print_status: str
    join_status: str
    meals_status: str
    report_issue: str
    unregistered_number: str = ""


class ReportSummary(BaseModel):
    registered: int
    approved: int
    pending_approval: int
    rejected: int
    printed: int
    entry_gate: int
    meals_gate: int
    drunk_issue: int
    other_issues: int


class FinalReport(BaseModel):
    summary: ReportSummary
    rows: list[ReportRow]


class JoinEventUploadResult(BaseModel):
    inserted: int
    updated: int


class JoinEventDeleteResult(BaseModel):
    deleted: int
    children_deleted: int = 0


class DeletionLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    ip_address: str
    username: str
    action: str
    detail: str


class SummaryCompanyStrength(BaseModel):
    company_code: str
    company_name: str
    employees: int
    strength: int


class SummaryCompanyRegistration(BaseModel):
    company_code: str
    company_name: str
    registered_employees: int
    family_members: int
    unregistered_employees: int
    total_employees_and_family: int


class SummaryCategoryCount(BaseModel):
    category: str
    count: int


class SummaryPass(BaseModel):
    unique_event_id: int
    employee_id: str
    employee_name: str
    name: str
    relation: str
    company_code: str
    company_name: str
    department: str
    category: str
    admission_group: str
    approve_status: str
    print_status: str
    join_status: str
    meals_status: str
    unregistered_number: str = ""


class RegistrationSummaryReport(BaseModel):
    total_employees: int
    total_employee_strength: int
    children_under_five: int
    strength_by_company: list[SummaryCompanyStrength]
    total_registrations: int
    registered_employees_by_company: list[SummaryCompanyRegistration]
    registered_employees: list[SummaryPass]
    unregistered_employees: list[SummaryPass]
    family_members: list[SummaryPass]
    categories: list[SummaryCategoryCount]
    entry_gate_count: int
    meals_gate_count: int
    entry_gate: list[SummaryPass]
    meals_gate: list[SummaryPass]
    registrations: list[SummaryPass]


class AppUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    username: str
    password: str


class AppUserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=50)

    @field_validator("username", "password")
    @classmethod
    def strip_user(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field is required")
        return value

    @field_validator("username")
    @classmethod
    def user_name_characters(cls, value: str) -> str:
        allowed = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-")
        if not value[0].isalnum() or any(character not in allowed for character in value):
            raise ValueError("Start with a letter or number. Then use letters, numbers, dots, underscores, or hyphens")
        return value


class AppUserPasswordUpdate(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=50)

    @field_validator("username", "password")
    @classmethod
    def strip_user_password(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field is required")
        return value


class GateIssue(GateEntry):
    report_issue: str

    @field_validator("report_issue")
    @classmethod
    def known_issue(cls, value: str) -> str:
        if value not in ("Drunk Issue", "Other Issues"):
            raise ValueError("Choose Drunk Issue or Other Issues")
        return value
