import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createCompany,
  updateCompany,
  createDepartment,
  createUser,
  approveAllAttendees,
  rejectAllAttendees,
  decideAttendee,
  deleteAllEmployees,
  deleteUser,
  downloadJoinEvents,
  downloadPassesPdf,
  downloadAllDepartmentPassesPdf,
  downloadReprintPdf,
  fetchApprovedPasses,
  fetchAllDepartmentPasses,
  fetchPendingPrintDepartments,
  fetchPrintedPasses,
  fetchAttendees,
  fetchCategories,
  resetCategoryPrefixes,
  fetchCompanies,
  fetchDepartmentMaster,
  fetchDepartments,
  fetchPendingApprovalDepartments,
  fetchAllDepartments,
  deleteAllJoinEvents,
  deleteJoinEvent,
  fetchDeletionLogs,
  fetchEmployee,
  fetchHealth,
  fetchSession,
  lockAdmin,
  loginApp,
  logoutApp,
  updateEmployeeStrength,
  fetchEmployees,
  fetchJoinEvents,
  fetchJoinEventReport,
  fetchRegistrationSummary,
  downloadRegistrationList,
  downloadRegistrationSummary,
  loginAttendees,
  recordGateEntry,
  recordMealsEntry,
  saveBulkRegistration,
  saveJoinEvent,
  fetchUnregisteredHousehold,
  fetchUsers,
  saveUnregisteredFamily,
  saveUnregisteredJoin,
  updateDepartmentPassword,
  updateUserPassword,
  unlockAdmin,
  uploadEmployees,
  uploadJoinEvents,
} from './api'
import './App.css'

const EMPTY_FORM = { company_code: '', company_name: '' }
const EMPLOYEE_PAGE_SIZE = 100
const ATTENDEE_PAGE_SIZE = 50
const SUMMARY_PAGE_SIZE = 50
const REPRINT_PAGE_SIZE = 50
const PASS_PAGE_SIZE = 50
const REPORT_PAGE_SIZE = 50
const RELATIONS = ['Employee', 'Father', 'Mother', 'Wife', 'Husband', 'Daughter', 'Son', 'Brother', 'Sister']
const UNREGISTERED_ATTENDEE_LIMIT = 6
const UNREGISTERED_COMPANY = 'SAEH'
const GATE_SCAN_INTERVAL_MS = 1000

function departmentKey(row) {
  return `${row.company_code}\u0000${row.department}`
}

function appPath() {
  return window.location.pathname.replace(/\/+$/, '') || '/'
}

function employeePortalPath() {
  return appPath() === '/employee'
}

function approvalPortalPath() {
  return appPath() === '/approval'
}

function entryPortalPath() {
  return appPath() === '/entry'
}

function mealsPortalPath() {
  return appPath() === '/meals'
}

function gatePortalPath() {
  return entryPortalPath() || mealsPortalPath()
}

function portalPath() {
  return employeePortalPath() || approvalPortalPath() || gatePortalPath()
}

function initialView() {
  const hash = window.location.hash
  if (employeePortalPath()) {
    if (hash.startsWith('#join-event/')) return 'join-employee'
    if (hash.startsWith('#join-event')) return 'join'
    if (hash.startsWith('#unregistered-employee/')) return 'unregistered-family'
    if (hash === '#unregistered-employee') return 'unregistered'
    return 'registration'
  }
  if (approvalPortalPath()) return 'attendees'
  if (entryPortalPath()) return 'gate'
  if (mealsPortalPath()) return 'meals'
  if (hash === '#department') return 'departments'
  if (hash === '#employee-upload') return 'employees'
  if (hash === '#employee-registration') return 'registration'
  if (hash.startsWith('#join-event')) return 'join'
  if (hash.startsWith('#unregistered-employee/')) return 'unregistered-family'
  if (hash === '#unregistered-employee') return 'unregistered'
  if (hash === '#bulk-registration') return 'bulk'
  if (hash === '#view-attendees') return 'attendees'
  if (hash === '#print-pass') return 'passes'
  if (hash === '#reprint-pass') return 'reprints'
  if (hash === '#admin') return 'admin'
  if (hash === '#entry-gate') return 'gate'
  if (hash === '#meals-gate') return 'meals'
  if (hash === '#final-report') return 'report'
  if (hash === '#registration-summary') return 'summary'
  return 'companies'
}

function formatLogTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function DeletionLogTable({ rows, page, onPage }) {
  const pageCount = Math.max(1, Math.ceil(rows.length / SUMMARY_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const start = currentPage * SUMMARY_PAGE_SIZE
  const pageRows = rows.slice(start, start + SUMMARY_PAGE_SIZE)
  const rangeStart = rows.length === 0 ? 0 : start + 1
  const rangeEnd = start + pageRows.length

  return (
    <div className="join-data">
      <div className="summary-section-head">
        <h3>Deletion log</h3>
        {rows.length > 0 && (
          <div className="pager">
            <button type="button" onClick={() => onPage(Math.max(0, currentPage - 1))} disabled={currentPage === 0}>
              Previous
            </button>
            <p>
              {rangeStart}–{rangeEnd} of {rows.length}
            </p>
            <button
              type="button"
              onClick={() => onPage(Math.min(pageCount - 1, currentPage + 1))}
              disabled={currentPage >= pageCount - 1}
            >
              Next
            </button>
          </div>
        )}
      </div>
      <p className="hint-text">
        Removals are listed here with the signed-in user and the address of the computer that made the change.
      </p>
      {pageRows.length === 0 ? (
        <p className="empty">No deletions recorded yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>User</th>
                <th>IP address</th>
                <th>Action</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr key={row.id}>
                  <td>{formatLogTime(row.created_at)}</td>
                  <td>{row.username || '—'}</td>
                  <td>{row.ip_address || '—'}</td>
                  <td>{row.action}</td>
                  <td>{row.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function PagedSummarySection({ title, rows, empty, countLabel = '' }) {
  const [page, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(rows.length / SUMMARY_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const start = currentPage * SUMMARY_PAGE_SIZE
  const pageRows = rows.slice(start, start + SUMMARY_PAGE_SIZE)
  const rangeStart = rows.length === 0 ? 0 : start + 1
  const rangeEnd = start + pageRows.length

  return (
    <>
      <div className="summary-section-head">
        <h3>{title}</h3>
        {rows.length > 0 && (
          <div className="pager no-print">
            <button type="button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={currentPage === 0}>
              Previous
            </button>
            <p>
              {rangeStart}–{rangeEnd} of {rows.length}
            </p>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
              disabled={currentPage >= pageCount - 1}
            >
              Next
            </button>
          </div>
        )}
      </div>
      {countLabel ? <p className="count">{countLabel}</p> : null}
      <SummaryPassTable rows={pageRows} empty={empty} />
    </>
  )
}

function SummaryPassTable({ rows, empty }) {
  if (!rows.length) return <p className="empty">{empty}</p>
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Event id</th>
            <th>Employee id</th>
            <th>Unregistered number</th>
            <th>Employee name</th>
            <th>Name</th>
            <th>Relation</th>
            <th>Company</th>
            <th>Department</th>
            <th>Approve</th>
            <th>Print</th>
            <th>Entry</th>
            <th>Meals</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.unique_event_id}>
              <td>{row.unique_event_id}</td>
              <td>{row.employee_id || '—'}</td>
              <td>{row.unregistered_number || '—'}</td>
              <td>{row.employee_name}</td>
              <td>{row.name}</td>
              <td>{row.relation}</td>
              <td>{row.company_code}</td>
              <td>{row.department}</td>
              <td>
                <span className={`status status-${row.approve_status.toLowerCase()}`}>{row.approve_status}</span>
              </td>
              <td>
                <span className={`status status-${row.print_status.toLowerCase()}`}>{row.print_status}</span>
              </td>
              <td>
                <span className={`status status-${row.join_status.toLowerCase()}`}>{row.join_status}</span>
              </td>
              <td>
                <span className={`status status-${row.meals_status.toLowerCase()}`}>{row.meals_status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PageHeader({ title = '' }) {
  return (
    <header className="page-header">
      <img src="/sreedhareeyam-logo.png" alt="Sreedhareeyam" />
      <p className="page-header-name">Sreedhareeyam Ayurvedic Eye Hospital And Research Centre Pvt Ltd</p>
      <p className="page-header-event">Annual Day 2026</p>
      {title ? <h1 className="page-header-event">{title}</h1> : null}
    </header>
  )
}

export default function App() {
  const [view, setView] = useState(initialView)
  const [companies, setCompanies] = useState([])
  const [departmentRows, setDepartmentRows] = useState([])
  const [deptCompany, setDeptCompany] = useState('')
  const [deptName, setDeptName] = useState('')
  const [deptPassword, setDeptPassword] = useState('')
  const [deptQuery, setDeptQuery] = useState('')
  const [deptPasswords, setDeptPasswords] = useState({})
  const [updatingDepartmentKey, setUpdatingDepartmentKey] = useState('')
  const [employees, setEmployees] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingCompany, setEditingCompany] = useState('')
  const [query, setQuery] = useState('')
  const [employeeQuery, setEmployeeQuery] = useState('')
  const [employeePage, setEmployeePage] = useState(0)
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [employeesVisible, setEmployeesVisible] = useState(false)
  const [strengthDrafts, setStrengthDrafts] = useState({})
  const [updatingStrengthId, setUpdatingStrengthId] = useState('')
  const [viewingEmployees, setViewingEmployees] = useState(false)
  const [deletingEmployees, setDeletingEmployees] = useState(false)
  const [error, setError] = useState('')
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [signingIn, setSigningIn] = useState(false)
  const [sessionUser, setSessionUser] = useState('')
  const [sessionReady, setSessionReady] = useState(portalPath)
  const [notice, setNotice] = useState('')
  const [joinEmployeeId, setJoinEmployeeId] = useState('')
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [members, setMembers] = useState([])
  const [kidsNumber, setKidsNumber] = useState('')
  const [unregName, setUnregName] = useState('')
  const [unregCompany, setUnregCompany] = useState(UNREGISTERED_COMPANY)
  const [unregDepartment, setUnregDepartment] = useState('')
  const [unregDepartments, setUnregDepartments] = useState([])
  const [unregMembers, setUnregMembers] = useState([])
  const [unregLookup, setUnregLookup] = useState('')
  const [unregHelp, setUnregHelp] = useState(false)
  const [unregHousehold, setUnregHousehold] = useState(null)
  const [unregAttendees, setUnregAttendees] = useState([])
  const [categories, setCategories] = useState([])
  const [bulkCategoryId, setBulkCategoryId] = useState('')
  const [bulkCompany, setBulkCompany] = useState('')
  const [bulkDepartment, setBulkDepartment] = useState('')
  const [bulkDepartments, setBulkDepartments] = useState([])
  const [bulkTotal, setBulkTotal] = useState('')
  const [existingAttendees, setExistingAttendees] = useState([])
  const [removingId, setRemovingId] = useState(null)
  const [lookingUp, setLookingUp] = useState(false)
  const [attendeeCompany, setAttendeeCompany] = useState('')
  const [attendeeDepartment, setAttendeeDepartment] = useState('')
  const [attendeePassword, setAttendeePassword] = useState('')
  const [departmentOptions, setDepartmentOptions] = useState([])
  const [attendees, setAttendees] = useState([])
  const [attendeePage, setAttendeePage] = useState(0)
  const [attendeeSession, setAttendeeSession] = useState(null)
  const [loggingIn, setLoggingIn] = useState(false)
  const [approvingAll, setApprovingAll] = useState(false)
  const [rejectingAll, setRejectingAll] = useState(false)
  const [passCompany, setPassCompany] = useState('')
  const [passDepartment, setPassDepartment] = useState('')
  const [passDepartments, setPassDepartments] = useState([])
  const [passes, setPasses] = useState([])
  const [passesLoaded, setPassesLoaded] = useState(false)
  const [passPage, setPassPage] = useState(0)
  const [selectedPassIds, setSelectedPassIds] = useState([])
  const [viewingPasses, setViewingPasses] = useState(false)
  const [printingPasses, setPrintingPasses] = useState(false)
  const [reprintCompany, setReprintCompany] = useState('')
  const [reprintDepartment, setReprintDepartment] = useState('')
  const [reprintDepartments, setReprintDepartments] = useState([])
  const [reprints, setReprints] = useState([])
  const [reprintsLoaded, setReprintsLoaded] = useState(false)
  const [reprintQuery, setReprintQuery] = useState('')
  const [reprintPage, setReprintPage] = useState(0)
  const [selectedReprintIds, setSelectedReprintIds] = useState([])
  const [viewingReprints, setViewingReprints] = useState(false)
  const [reprintingPasses, setReprintingPasses] = useState(false)
  const [joinFile, setJoinFile] = useState(null)
  const [downloadingJoins, setDownloadingJoins] = useState(false)
  const [uploadingJoins, setUploadingJoins] = useState(false)
  const [deletingJoins, setDeletingJoins] = useState(false)
  const [resettingPrefixes, setResettingPrefixes] = useState(false)
  const [adminKey, setAdminKey] = useState('')
  const [deletionLogs, setDeletionLogs] = useState([])
  const [deletionPage, setDeletionPage] = useState(0)
  const [adminUnlocked, setAdminUnlocked] = useState(false)
  const [userRows, setUserRows] = useState([])
  const [userName, setUserName] = useState('')
  const [userPassword, setUserPassword] = useState('')
  const [userPasswords, setUserPasswords] = useState({})
  const [updatingUser, setUpdatingUser] = useState('')
  const [deletingUser, setDeletingUser] = useState('')
  const [joineePass, setJoineePass] = useState('')
  const [gateResult, setGateResult] = useState(null)
  const [entering, setEntering] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [cameraUrl, setCameraUrl] = useState('')
  const [report, setReport] = useState(null)
  const [reportPage, setReportPage] = useState(0)
  const [summary, setSummary] = useState(null)
  const [summaryPage, setSummaryPage] = useState(0)
  const [downloadingSummary, setDownloadingSummary] = useState(false)
  const [downloadingList, setDownloadingList] = useState(false)
  const passInputRef = useRef(null)
  const videoRef = useRef(null)
  const scanStreamRef = useRef(null)
  const gateBusyRef = useRef(false)
  const gateReadyAtRef = useRef(0)
  const scanResumeTimerRef = useRef(0)
  const mealsFromCameraRef = useRef(false)
  const submitGateRef = useRef(async () => {})
  const passLoadRef = useRef(0)

  async function load() {
    setError('')
    await fetchHealth()
    setCompanies(await fetchCompanies())
  }

  useEffect(() => {
    if (portalPath()) return undefined
    let cancelled = false
    fetchSession()
      .then((session) => {
        if (cancelled) return
        setSessionUser(session.username)
        setAdminUnlocked(Boolean(session.admin))
      })
      .catch((err) => {
        if (cancelled) return
        setSessionUser('')
        if (String(err.message || '').includes('Cannot reach')) setLoginError(err.message)
      })
      .finally(() => {
        if (!cancelled) setSessionReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    submitGateRef.current = submitGate
  })

  useEffect(() => {
    if (view !== 'gate' && view !== 'meals') {
      if (scanStreamRef.current) stopScan()
      return undefined
    }
    if (!scanning || !scanStreamRef.current || !videoRef.current || !('BarcodeDetector' in window)) {
      return undefined
    }
    const video = videoRef.current
    video.srcObject = scanStreamRef.current
    let stopped = false
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
    let timer = 0
    const look = async () => {
      if (stopped) return
      try {
        const codes = await detector.detect(video)
        const value = codes[0]?.rawValue?.trim()
        if (value) {
          stopScan()
          if (view === 'meals') {
            mealsFromCameraRef.current = true
            setJoineePass(value)
            setGateResult(null)
            setError('')
            passInputRef.current?.focus()
            return
          }
          submitGateRef.current(value, { resumeCamera: true })
          return
        }
      } catch {
        // The camera can reject a frame while it is still starting.
      }
      if (!stopped) timer = window.setTimeout(look, 250)
    }
    video.play().then(look).catch(() => {
      setError('Allow the camera to scan the pass, or type the joining id.')
      stopScan()
    })
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [view, scanning])

  useEffect(() => {
    const link = document.querySelector('.nav .nav-link.is-active')
    const nav = link?.closest('.nav')
    if (link && nav) {
      const top = link.offsetTop
      const bottom = top + link.offsetHeight
      if (top < nav.scrollTop) nav.scrollTop = top
      else if (bottom > nav.scrollTop + nav.clientHeight) nav.scrollTop = bottom - nav.clientHeight
    }
    if (view === 'gate' || view === 'meals') passInputRef.current?.focus()
  }, [view])

  useEffect(() => {
    if (view !== 'departments') return undefined
    let cancelled = false
    fetchDepartmentMaster()
      .then((rows) => {
        if (cancelled) return
        setDepartmentRows(rows)
        setDeptPasswords(Object.fromEntries(rows.map((row) => [departmentKey(row), row.password])))
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [view])

  useEffect(() => {
    if (!sessionReady || (!portalPath() && !sessionUser)) return undefined
    const match = window.location.hash.match(/^#unregistered-employee\/(.+)$/)
    if (!match) return undefined
    const number = decodeURIComponent(match[1])
    let cancelled = false
    fetchUnregisteredHousehold(number)
      .then((rows) => {
        if (cancelled) return
        const employee = rows.find((row) => row.relation === 'Employee') || rows[0]
        setUnregHousehold(employee)
        setUnregAttendees(rows)
        setView('unregistered-family')
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [sessionReady, sessionUser])

  useEffect(() => {
    if (view !== 'unregistered') return undefined
    setUnregCompany(UNREGISTERED_COMPANY)
    let cancelled = false
    fetchAllDepartments()
      .then((rows) => {
        if (!cancelled) setUnregDepartments(rows)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [view])

  useEffect(() => {
    if (view !== 'bulk') return undefined
    let cancelled = false
    Promise.all([fetchCategories(), fetchAllDepartments()])
      .then(([categoryRows, departmentRows]) => {
        if (cancelled) return
        setCategories(categoryRows)
        setBulkDepartments(departmentRows)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [view])

  useEffect(() => {
    if (view !== 'report') return undefined
    let cancelled = false
    fetchJoinEventReport()
      .then((data) => {
        if (!cancelled) {
          setReport(data)
          setReportPage(0)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [view])

  useEffect(() => {
    if (view !== 'summary') return undefined
    let cancelled = false
    fetchRegistrationSummary()
      .then((data) => {
        if (!cancelled) {
          setSummary(data)
          setSummaryPage(0)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [view])

  useEffect(() => {
    let cancelled = false
    load()
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function showCompanies(event) {
    event?.preventDefault()
    window.location.hash = 'add-company'
    setView('companies')
    setError('')
    setNotice('')
  }

  function showDepartments(event) {
    event?.preventDefault()
    window.location.hash = 'department'
    setView('departments')
    setError('')
    setNotice('')
  }

  function showEmployees(event) {
    event?.preventDefault()
    window.location.hash = 'employee-upload'
    setView('employees')
    setEmployeesVisible(false)
    setError('')
    setNotice('')
  }

  function showRegistration(event) {
    event?.preventDefault()
    window.location.hash = 'employee-registration'
    setView('registration')
    setError('')
    setNotice('')
  }

  function showJoin(event) {
    event?.preventDefault()
    window.location.hash = 'join-event'
    setView('join')
    setSelectedEmployee(null)
    setMembers([])
    setKidsNumber('')
    setExistingAttendees([])
    setError('')
    setNotice('')
  }

  function showBulk(event) {
    event?.preventDefault()
    window.location.hash = 'bulk-registration'
    setView('bulk')
    setBulkCategoryId('')
    setBulkCompany('')
    setBulkDepartment('')
    setBulkTotal('')
    setError('')
    setNotice('')
  }

  function showUnregistered(event) {
    event?.preventDefault()
    window.location.hash = 'unregistered-employee'
    setView('unregistered')
    setUnregName('')
    setUnregCompany(UNREGISTERED_COMPANY)
    setUnregDepartment('')
    setUnregMembers([])
    setUnregLookup('')
    setUnregHousehold(null)
    setUnregAttendees([])
    setError('')
    setNotice('')
  }

  function showAttendees(event) {
    event?.preventDefault()
    window.location.hash = 'view-attendees'
    setView('attendees')
    setAttendeeSession(null)
    setAttendees([])
    setAttendeePage(0)
    setAttendeePassword('')
    setError('')
    setNotice('')
    if (!attendeeCompany) return
    fetchPendingApprovalDepartments(attendeeCompany)
      .then((departments) => {
        setDepartmentOptions(departments)
        setAttendeeDepartment((current) =>
          departments.some((row) => row.department === current) ? current : '',
        )
      })
      .catch((err) => setError(err.message))
  }

  function showPasses(event) {
    event?.preventDefault()
    window.location.hash = 'print-pass'
    setView('passes')
    setError('')
    setNotice('')
  }

  function showReprints(event) {
    event?.preventDefault()
    window.location.hash = 'reprint-pass'
    setView('reprints')
    setError('')
    setNotice('')
  }

  function loadDeletionLogs() {
    return fetchDeletionLogs()
      .then((rows) => {
        setDeletionLogs(rows)
        setDeletionPage(0)
      })
      .catch((err) => setError(err.message))
  }

  useEffect(() => {
    if (view !== 'admin' || !adminUnlocked) return undefined
    let cancelled = false
    loadDeletionLogs()
    fetchUsers()
      .then((rows) => {
        if (cancelled) return
        setUserRows(rows)
        setUserPasswords(Object.fromEntries(rows.map((row) => [row.username, row.password])))
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [view, adminUnlocked])

  function endSignIn() {
    setSessionUser('')
    setAdminUnlocked(false)
    setLoginUsername('')
    setLoginPassword('')
    setLoginError('Sign in again. This sign-in is no longer valid.')
  }

  useEffect(() => {
    function onSignOut() {
      endSignIn()
    }
    window.addEventListener('srdm-sign-out', onSignOut)
    return () => window.removeEventListener('srdm-sign-out', onSignOut)
  }, [])

  useEffect(() => {
    if (portalPath() || !sessionUser) return undefined
    let cancelled = false
    const check = () => {
      fetchSession()
        .then((session) => {
          if (!cancelled) setSessionUser(session.username)
        })
        .catch((err) => {
          if (!cancelled && err.message === 'Sign in required') endSignIn()
        })
    }
    const timer = window.setInterval(check, 15000)
    window.addEventListener('focus', check)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.removeEventListener('focus', check)
    }
  }, [sessionUser])

  async function showAdmin(event) {
    event?.preventDefault()
    window.location.hash = 'admin'
    setView('admin')
    setAdminKey('')
    setAdminUnlocked(false)
    setJoinFile(null)
    setUserName('')
    setUserPassword('')
    setError('')
    setNotice('')
    try {
      await lockAdmin()
    } catch (err) {
      if (err.message === 'Sign in required') endSignIn()
    }
  }

  async function onAddUser(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const saved = await createUser({
        username: userName.trim(),
        password: userPassword.trim(),
      })
      setUserRows((current) =>
        [...current, saved].sort((left, right) => left.username.localeCompare(right.username)),
      )
      setUserPasswords((current) => ({ ...current, [saved.username]: saved.password }))
      setUserName('')
      setUserPassword('')
      setNotice(`Added ${saved.username}.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function onUpdateUserPassword(row) {
    const password = (userPasswords[row.username] || '').trim()
    if (!password) {
      setError('Enter a password.')
      return
    }
    setUpdatingUser(row.username)
    setError('')
    setNotice('')
    try {
      const saved = await updateUserPassword({ username: row.username, password })
      setUserRows((current) => current.map((item) => (item.username === row.username ? saved : item)))
      setUserPasswords((current) => ({ ...current, [saved.username]: saved.password }))
      setNotice(`Updated the password for ${saved.username}.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setUpdatingUser('')
    }
  }

  async function onDeleteUser(row) {
    if (!window.confirm(`Delete ${row.username}? That user will no longer be able to sign in.`)) return
    setDeletingUser(row.username)
    setError('')
    setNotice('')
    try {
      await deleteUser(row.username)
      setUserRows((current) => current.filter((item) => item.username !== row.username))
      setUserPasswords((current) => {
        const next = { ...current }
        delete next[row.username]
        return next
      })
      setNotice(`Deleted ${row.username}.`)
      loadDeletionLogs()
    } catch (err) {
      setError(err.message)
    } finally {
      setDeletingUser('')
    }
  }

  async function onUnlockAdmin(event) {
    event.preventDefault()
    setError('')
    try {
      const session = await unlockAdmin(adminKey.trim())
      setAdminUnlocked(Boolean(session.admin))
      setAdminKey('')
    } catch (err) {
      setAdminUnlocked(false)
      if (err.message === 'Sign in required') {
        endSignIn()
        return
      }
      setError(err.message)
    }
  }

  function stopScan() {
    window.clearTimeout(scanResumeTimerRef.current)
    scanStreamRef.current?.getTracks().forEach((track) => track.stop())
    scanStreamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setScanning(false)
  }

  function stopCamera() {
    mealsFromCameraRef.current = false
    stopScan()
  }

  function openGate(nextView, hash) {
    window.location.hash = hash
    setView(nextView)
    mealsFromCameraRef.current = false
    setGateResult(null)
    setJoineePass('')
    setError('')
    setNotice('')
    stopScan()
  }

  function showGate(event) {
    event?.preventDefault()
    openGate('gate', 'entry-gate')
  }

  function showMeals(event) {
    event?.preventDefault()
    openGate('meals', 'meals-gate')
  }

  function showReport(event) {
    event?.preventDefault()
    window.location.hash = 'final-report'
    setView('report')
    setReportPage(0)
    setError('')
    setNotice('')
  }

  function showSummary(event) {
    event?.preventDefault()
    window.location.hash = 'registration-summary'
    setView('summary')
    setError('')
    setNotice('')
  }

  async function onDownloadSummary() {
    setDownloadingSummary(true)
    setError('')
    setNotice('')
    try {
      const blob = await downloadRegistrationSummary()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'registration-summary.pdf'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setNotice('Registration summary downloaded.')
    } catch (err) {
      setError(err.message)
    } finally {
      setDownloadingSummary(false)
    }
  }

  async function onDownloadRegistrationList() {
    setDownloadingList(true)
    setError('')
    setNotice('')
    try {
      const blob = await downloadRegistrationList()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'registration-list.pdf'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setNotice('Registration list downloaded.')
    } catch (err) {
      setError(err.message)
    } finally {
      setDownloadingList(false)
    }
  }

  async function onAppLogin(event) {
    event.preventDefault()
    setSigningIn(true)
    setLoginError('')
    try {
      const session = await loginApp(loginUsername, loginPassword)
      setSessionUser(session.username)
      setLoginPassword('')
    } catch (err) {
      setLoginError(err.message)
    } finally {
      setSigningIn(false)
    }
  }

  async function onAppLogout() {
    setError('')
    try {
      await logoutApp()
    } catch (err) {
      setError(err.message)
      return
    }
    setSessionUser('')
    setAdminUnlocked(false)
    setLoginUsername('')
    setLoginPassword('')
    setLoginError('')
  }

  async function startScan(options = {}) {
    if (!options.keepError) setError('')
    if (scanStreamRef.current) stopScan()
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      const secureUrl = `https://193.203.161.99:8443/${window.location.hash}`
      setCameraUrl(secureUrl)
      setError('The phone blocks the camera on this address. Open the secure link, accept the warning, then tap Scan with camera.')
      return
    }
    setCameraUrl('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      scanStreamRef.current = stream
      setScanning(true)
    } catch {
      setError('Allow the camera to scan the pass, or type the joining id.')
      stopScan()
    }
  }

  async function submitGate(rawId, options = {}) {
    const joiningId = String(rawId ?? '').trim()
    if (!joiningId) return
    if (gateBusyRef.current || (view === 'gate' && Date.now() < gateReadyAtRef.current)) {
      if (view === 'gate') setJoineePass('')
      return
    }
    gateBusyRef.current = true
    setEntering(true)
    setJoineePass(joiningId)
    setGateResult(null)
    setError('')
    try {
      const save = view === 'meals' ? recordMealsEntry : recordGateEntry
      setGateResult(await save(joiningId))
      setJoineePass('')
    } catch (err) {
      setError(err.message)
    } finally {
      gateBusyRef.current = false
      setEntering(false)
      if (view === 'gate') gateReadyAtRef.current = Date.now() + GATE_SCAN_INTERVAL_MS
      if (options.resumeCamera) {
        window.clearTimeout(scanResumeTimerRef.current)
        scanResumeTimerRef.current = window.setTimeout(
          () => startScan({ keepError: true }),
          GATE_SCAN_INTERVAL_MS,
        )
      }
      passInputRef.current?.focus()
    }
  }

  function onGateEntry(event) {
    event.preventDefault()
    if (view === 'meals') return
    submitGate(joineePass)
  }

  function focusPassWithoutKeyboard(event) {
    event.preventDefault()
    event.currentTarget.focus({ preventScroll: true })
  }

  function onPassChange(event) {
    const value = event.target.value
    setJoineePass(value)
    if (view === 'meals') {
      mealsFromCameraRef.current = false
      setGateResult(null)
      return
    }
    if (/^\d{10,}$/.test(value.trim())) submitGate(value)
  }

  function passScope(companyCode, departmentValue) {
    if (!departmentValue || departmentValue === '*') {
      return {
        allDepartments: true,
        companyCode: !companyCode || companyCode === '*' ? '' : companyCode,
        department: '',
      }
    }
    const splitAt = departmentValue.indexOf('\u001f')
    if (companyCode === '*' && splitAt !== -1) {
      return {
        allDepartments: false,
        companyCode: departmentValue.slice(0, splitAt),
        department: departmentValue.slice(splitAt + 1),
      }
    }
    return { allDepartments: false, companyCode, department: departmentValue }
  }

  async function loadPrintPasses(companyCode, departmentValue) {
    if (typeof companyCode !== 'string' || typeof departmentValue !== 'string') return
    const requestId = passLoadRef.current + 1
    passLoadRef.current = requestId
    const scope = passScope(companyCode, departmentValue)
    setViewingPasses(true)
    setError('')
    setNotice('')
    setPassPage(0)
    try {
      const rows = scope.allDepartments
        ? await fetchAllDepartmentPasses(scope.companyCode)
        : await fetchApprovedPasses(scope.companyCode, scope.department)
      if (requestId !== passLoadRef.current) return
      const waiting = rows.filter((row) => row.print_status !== 'Printed')
      setPasses(waiting)
      setPassesLoaded(true)
      setSelectedPassIds(waiting.map((row) => row.unique_event_id))
    } catch (err) {
      if (requestId !== passLoadRef.current) return
      setError(err.message)
      setPasses([])
      setSelectedPassIds([])
      setPassesLoaded(true)
    } finally {
      if (requestId === passLoadRef.current) setViewingPasses(false)
    }
  }

  async function onPassCompany(companyCode) {
    const departmentValue = companyCode ? '*' : ''
    setPassCompany(companyCode)
    setPassDepartment(departmentValue)
    setPassDepartments([])
    setPasses([])
    setPassesLoaded(false)
    setPassPage(0)
    setSelectedPassIds([])
    if (!companyCode) return
    try {
      setPassDepartments(await fetchPendingPrintDepartments(companyCode === '*' ? '' : companyCode))
    } catch (err) {
      setError(err.message)
    }
    await loadPrintPasses(companyCode, departmentValue)
  }

  async function onViewPasses(event) {
    event.preventDefault()
    if (!passCompany || !passDepartment) return
    await loadPrintPasses(passCompany, passDepartment)
  }

  function togglePass(eventId) {
    setSelectedPassIds((current) =>
      current.includes(eventId) ? current.filter((id) => id !== eventId) : [...current, eventId],
    )
  }

  function toggleAllPasses() {
    setSelectedPassIds((current) =>
      current.length === passes.length ? [] : passes.map((row) => row.unique_event_id),
    )
  }

  function openPassPdf(blob) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'event-passes.pdf'
    document.body.appendChild(link)
    link.click()
    link.remove()

    const frame = document.createElement('iframe')
    frame.title = 'Event passes'
    frame.style.position = 'fixed'
    frame.style.width = '0'
    frame.style.height = '0'
    frame.style.border = '0'
    frame.src = url
    const cleanup = () => {
      frame.remove()
      URL.revokeObjectURL(url)
    }
    frame.onload = () => {
      const printWindow = frame.contentWindow
      if (!printWindow) {
        cleanup()
        return
      }
      printWindow.addEventListener('afterprint', cleanup, { once: true })
      try {
        printWindow.focus()
        printWindow.print()
      } catch {
        cleanup()
        return
      }
      window.setTimeout(cleanup, 60000)
    }
    document.body.appendChild(frame)
  }

  async function onPrintPasses() {
    if (!selectedPassIds.length) return
    setPrintingPasses(true)
    setError('')
    setNotice('')
    try {
      const scope = passScope(passCompany, passDepartment)
      const blob = scope.allDepartments
        ? await downloadAllDepartmentPassesPdf({
            company_code: scope.companyCode,
            unique_event_ids: selectedPassIds,
          })
        : await downloadPassesPdf({
            company_code: scope.companyCode,
            department: scope.department,
            unique_event_ids: selectedPassIds,
          })
      openPassPdf(blob)
      const printed = new Set(selectedPassIds)
      const remaining = passes.filter((row) => !printed.has(row.unique_event_id))
      setPasses(remaining)
      setPassPage(0)
      setSelectedPassIds([])
      const departments = await fetchPendingPrintDepartments(passCompany === '*' ? '' : passCompany)
      setPassDepartments(departments)
      const departmentRemains = departments.some(
        (row) => row.company_code === scope.companyCode && row.department === scope.department,
      )
      if (scope.allDepartments ? departments.length === 0 : !departmentRemains) {
        setPassDepartment(passCompany ? '*' : '')
        setPasses([])
        setPassesLoaded(false)
      }
      setNotice('Pass PDF downloaded. Printed passes were removed from this list.')
    } catch (err) {
      setError(err.message)
    } finally {
      setPrintingPasses(false)
    }
  }

  async function onReprintCompany(companyCode) {
    setReprintCompany(companyCode)
    setReprintDepartment('')
    setReprintDepartments([])
    setReprints([])
    setReprintsLoaded(false)
    setReprintQuery('')
    setReprintPage(0)
    setSelectedReprintIds([])
    if (!companyCode) return
    try {
      setReprintDepartments(await fetchDepartments(companyCode))
    } catch (err) {
      setError(err.message)
    }
  }

  async function onViewReprints(event) {
    event.preventDefault()
    setViewingReprints(true)
    setError('')
    setNotice('')
    setSelectedReprintIds([])
    setReprintQuery('')
    setReprintPage(0)
    try {
      const rows = await fetchPrintedPasses(reprintCompany, reprintDepartment)
      setReprints(rows.filter((row) => row.print_status === 'Printed'))
      setReprintsLoaded(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setViewingReprints(false)
    }
  }

  function toggleReprint(eventId) {
    setSelectedReprintIds((current) =>
      current.includes(eventId) ? current.filter((id) => id !== eventId) : [...current, eventId],
    )
  }

  function toggleAllReprints() {
    const ids = visibleReprints.map((row) => row.unique_event_id)
    setSelectedReprintIds((current) => {
      const allSelected = ids.length > 0 && ids.every((id) => current.includes(id))
      if (allSelected) return current.filter((id) => !ids.includes(id))
      return [...new Set([...current, ...ids])]
    })
  }

  async function onReprintPasses() {
    if (!selectedReprintIds.length) return
    setReprintingPasses(true)
    setError('')
    setNotice('')
    try {
      const blob = await downloadReprintPdf({
        company_code: reprintCompany,
        department: reprintDepartment,
        unique_event_ids: selectedReprintIds,
      })
      openPassPdf(blob)
      setNotice('Pass PDF downloaded. Use the print dialog to print the A4 sheet.')
    } catch (err) {
      setError(err.message)
    } finally {
      setReprintingPasses(false)
    }
  }

  async function onDownloadJoinEvents() {
    if (!adminUnlocked) return
    setDownloadingJoins(true)
    setError('')
    setNotice('')
    try {
      const blob = await downloadJoinEvents()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'joinevents.xlsx'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setNotice('JoinEvents downloaded.')
    } catch (err) {
      setError(err.message)
    } finally {
      setDownloadingJoins(false)
    }
  }

  async function onUploadJoinEvents(event) {
    event.preventDefault()
    if (!adminUnlocked || !joinFile) return
    setUploadingJoins(true)
    setError('')
    setNotice('')
    try {
      const result = await uploadJoinEvents(joinFile)
      setJoinFile(null)
      event.target.reset()
      setPasses([])
      setPassesLoaded(false)
      setSelectedPassIds([])
      setNotice(`${result.inserted} join-event rows added, ${result.updated} updated.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setUploadingJoins(false)
    }
  }

  async function onResetCategoryPrefixes() {
    if (!adminUnlocked) return
    const confirmed = window.confirm(
      'Reset every category PrefixNumber to zero? The next bulk pass for each category starts at 1.',
    )
    if (!confirmed) return
    setResettingPrefixes(true)
    setError('')
    setNotice('')
    try {
      const rows = await resetCategoryPrefixes()
      setCategories(rows)
      setNotice('Category PrefixNumber values are now zero.')
    } catch (err) {
      setError(err.message)
    } finally {
      setResettingPrefixes(false)
    }
  }

  async function onDeleteAllJoinEvents() {
    if (!adminUnlocked) return
    const confirmed = window.confirm(
      'Delete every row in JoinEvents and JoinChild? Printed passes are removed too. This cannot be undone.',
    )
    if (!confirmed) return
    setDeletingJoins(true)
    setError('')
    setNotice('')
    try {
      const result = await deleteAllJoinEvents()
      setPasses([])
      setPassesLoaded(false)
      setSelectedPassIds([])
      setReprints([])
      setReprintsLoaded(false)
      setSelectedReprintIds([])
      setNotice(
        `${result.deleted} join-event rows deleted. ${result.children_deleted ?? 0} child rows deleted.`,
      )
      loadDeletionLogs()
    } catch (err) {
      setError(err.message)
    } finally {
      setDeletingJoins(false)
    }
  }

  async function onAttendeeCompany(companyCode) {
    setAttendeeCompany(companyCode)
    setAttendeeDepartment('')
    setDepartmentOptions([])
    if (!companyCode) return
    try {
      setDepartmentOptions(await fetchPendingApprovalDepartments(companyCode))
    } catch (err) {
      setError(err.message)
    }
  }

  const visibleDepartments = useMemo(() => {
    const term = deptQuery.trim().toLowerCase()
    if (!term) return departmentRows
    return departmentRows.filter(
      (row) =>
        row.department.toLowerCase().includes(term) ||
        row.company_code.toLowerCase().includes(term),
    )
  }, [departmentRows, deptQuery])

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return companies
    return companies.filter(
      (company) =>
        company.company_code.toLowerCase().includes(term) ||
        company.company_name.toLowerCase().includes(term),
    )
  }, [companies, query])

  const visibleEmployees = useMemo(() => {
    const term = employeeQuery.trim().toLowerCase()
    if (!term) return employees
    return employees.filter((employee) =>
      [employee.employee_id, employee.employee_name, employee.department, employee.mobile, employee.company_code]
        .join(' ')
        .toLowerCase()
        .includes(term),
    )
  }, [employees, employeeQuery])

  const employeePageCount = Math.max(1, Math.ceil(visibleEmployees.length / EMPLOYEE_PAGE_SIZE))
  const currentEmployeePage = Math.min(employeePage, employeePageCount - 1)
  const pagedEmployees = visibleEmployees.slice(
    currentEmployeePage * EMPLOYEE_PAGE_SIZE,
    (currentEmployeePage + 1) * EMPLOYEE_PAGE_SIZE,
  )
  const employeeRangeStart = visibleEmployees.length === 0 ? 0 : currentEmployeePage * EMPLOYEE_PAGE_SIZE + 1
  const employeeRangeEnd = currentEmployeePage * EMPLOYEE_PAGE_SIZE + pagedEmployees.length
  const attendeePageCount = Math.max(1, Math.ceil(attendees.length / ATTENDEE_PAGE_SIZE))
  const currentAttendeePage = Math.min(attendeePage, attendeePageCount - 1)
  const attendeePageStart = currentAttendeePage * ATTENDEE_PAGE_SIZE
  const pagedAttendees = attendees.slice(attendeePageStart, attendeePageStart + ATTENDEE_PAGE_SIZE)
  const attendeeRangeStart = attendees.length === 0 ? 0 : attendeePageStart + 1
  const attendeeRangeEnd = attendeePageStart + pagedAttendees.length
  const summaryRegistrations = summary?.registrations ?? []
  const summaryPageCount = Math.max(1, Math.ceil(summaryRegistrations.length / SUMMARY_PAGE_SIZE))
  const currentSummaryPage = Math.min(summaryPage, summaryPageCount - 1)
  const summaryPageRows = summaryRegistrations.slice(
    currentSummaryPage * SUMMARY_PAGE_SIZE,
    (currentSummaryPage + 1) * SUMMARY_PAGE_SIZE,
  )
  const summaryRangeStart = summaryRegistrations.length === 0 ? 0 : currentSummaryPage * SUMMARY_PAGE_SIZE + 1
  const summaryRangeEnd = currentSummaryPage * SUMMARY_PAGE_SIZE + summaryPageRows.length
  const visibleReprints = useMemo(() => {
    const term = reprintQuery.trim().toLowerCase()
    if (!term) return reprints
    return reprints.filter((row) =>
      [row.name, row.employee_name, row.employee_id].join(' ').toLowerCase().includes(term),
    )
  }, [reprints, reprintQuery])
  const reprintPageCount = Math.max(1, Math.ceil(visibleReprints.length / REPRINT_PAGE_SIZE))
  const currentReprintPage = Math.min(reprintPage, reprintPageCount - 1)
  const reprintPageStart = currentReprintPage * REPRINT_PAGE_SIZE
  const pagedReprints = visibleReprints.slice(reprintPageStart, reprintPageStart + REPRINT_PAGE_SIZE)
  const reprintRangeStart = visibleReprints.length === 0 ? 0 : reprintPageStart + 1
  const reprintRangeEnd = reprintPageStart + pagedReprints.length
  const allVisibleReprintsSelected =
    visibleReprints.length > 0 &&
    visibleReprints.every((row) => selectedReprintIds.includes(row.unique_event_id))
  const passPageCount = Math.max(1, Math.ceil(passes.length / PASS_PAGE_SIZE))
  const currentPassPage = Math.min(passPage, passPageCount - 1)
  const passPageStart = currentPassPage * PASS_PAGE_SIZE
  const pagedPasses = passes.slice(passPageStart, passPageStart + PASS_PAGE_SIZE)
  const passRangeStart = passes.length === 0 ? 0 : passPageStart + 1
  const passRangeEnd = passPageStart + pagedPasses.length
  const reportRows = report?.rows ?? []
  const reportPageCount = Math.max(1, Math.ceil(reportRows.length / REPORT_PAGE_SIZE))
  const currentReportPage = Math.min(reportPage, reportPageCount - 1)
  const reportPageStart = currentReportPage * REPORT_PAGE_SIZE
  const pagedReportRows = reportRows.slice(reportPageStart, reportPageStart + REPORT_PAGE_SIZE)
  const reportRangeStart = reportRows.length === 0 ? 0 : reportPageStart + 1
  const reportRangeEnd = reportPageStart + pagedReportRows.length

  function updateField(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  function rememberCompanyCode(previous, next) {
    if (previous === next) return
    const swap = (value) => (value === previous ? next : value)
    const swapRows = (rows) => rows.map((row) => (row.company_code === previous ? { ...row, company_code: next } : row))
    setDeptCompany(swap)
    setUnregCompany(swap)
    setBulkCompany(swap)
    setAttendeeCompany(swap)
    setPassCompany(swap)
    setReprintCompany(swap)
    setUnregDepartments(swapRows)
    setBulkDepartments(swapRows)
    setDepartmentOptions(swapRows)
    setPassDepartments(swapRows)
    setReprintDepartments(swapRows)
    setEmployees((current) => swapRows(current))
    setDepartmentRows(swapRows)
    setSelectedEmployee((current) =>
      current && current.company_code === previous ? { ...current, company_code: next } : current,
    )
    setDeptPasswords((current) => {
      const nextPasswords = {}
      for (const [key, password] of Object.entries(current)) {
        const separator = key.indexOf('\u0000')
        const code = separator === -1 ? key : key.slice(0, separator)
        const department = separator === -1 ? '' : key.slice(separator + 1)
        const nextKey = code === previous ? departmentKey({ company_code: next, department }) : key
        nextPasswords[nextKey] = password
      }
      return nextPasswords
    })
  }

  function onEditCompany(company) {
    setEditingCompany(company.company_code)
    setForm({ company_code: company.company_code, company_name: company.company_name })
    setError('')
    setNotice('')
    document.getElementById('add-company')?.scrollIntoView({ block: 'nearest' })
  }

  function cancelEditCompany() {
    setEditingCompany('')
    setForm(EMPTY_FORM)
    setError('')
  }

  async function onSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    const payload = {
      company_code: form.company_code.trim(),
      company_name: form.company_name.trim(),
    }
    try {
      if (editingCompany) {
        const saved = await updateCompany(editingCompany, payload)
        rememberCompanyCode(editingCompany, saved.company_code)
        setNotice(`Updated ${saved.company_code}.`)
        setEditingCompany('')
      } else {
        await createCompany(payload)
        setNotice('')
      }
      setForm(EMPTY_FORM)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function onAddDepartment(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const saved = await createDepartment({
        company_code: deptCompany.trim(),
        department: deptName.trim(),
        password: deptPassword.trim(),
      })
      setDepartmentRows((current) =>
        [...current, saved].sort(
          (left, right) =>
            left.company_code.localeCompare(right.company_code) ||
            left.department.localeCompare(right.department),
        ),
      )
      setDeptPasswords((current) => ({ ...current, [departmentKey(saved)]: saved.password }))
      setDeptName('')
      setDeptPassword('')
      setNotice(`Added ${saved.department} for ${saved.company_code}.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function onUpdateDepartmentPassword(row) {
    const key = departmentKey(row)
    const password = (deptPasswords[key] || '').trim()
    if (!password) {
      setError('Enter a password.')
      return
    }
    setUpdatingDepartmentKey(key)
    setError('')
    setNotice('')
    try {
      const saved = await updateDepartmentPassword({
        company_code: row.company_code,
        department: row.department,
        password,
      })
      setDepartmentRows((current) =>
        current.map((item) => (departmentKey(item) === key ? saved : item)),
      )
      setDeptPasswords((current) => ({ ...current, [key]: saved.password }))
      setNotice(`Updated the password for ${saved.department}.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setUpdatingDepartmentKey('')
    }
  }

  async function onUpload(event) {
    event.preventDefault()
    if (!file) return
    setUploading(true)
    setError('')
    setNotice('')
    try {
      const result = await uploadEmployees(file)
      setFile(null)
      event.target.reset()
      const parts = []
      if (result.inserted) parts.push(`${result.inserted} added`)
      if (result.updated) parts.push(`${result.updated} updated`)
      setNotice(parts.join(', ') || 'Upload finished')
      if (employeesVisible) setEmployees(await fetchEmployees())
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  async function onUpdateEmployeeStrength(employee) {
    const draft = strengthDrafts[employee.employee_id]
    const text = draft === undefined ? String(employee.allowed_strength) : String(draft).trim()
    if (!/^\d+$/.test(text)) {
      setError('Allowed strength must be a whole number.')
      return
    }
    const allowedStrength = Number(text)
    setUpdatingStrengthId(employee.employee_id)
    setError('')
    setNotice('')
    try {
      const saved = await updateEmployeeStrength({
        employee_id: employee.employee_id,
        allowed_strength: allowedStrength,
      })
      setEmployees((current) =>
        current.map((row) => (row.employee_id === saved.employee_id ? saved : row)),
      )
      setSelectedEmployee((current) =>
        current && current.employee_id === saved.employee_id ? saved : current,
      )
      setStrengthDrafts((current) => ({ ...current, [saved.employee_id]: String(saved.allowed_strength) }))
      setNotice(`Allowed strength for ${saved.employee_id} is now ${saved.allowed_strength}.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setUpdatingStrengthId('')
    }
  }

  async function onViewEmployees() {
    setViewingEmployees(true)
    setError('')
    try {
      setEmployees(await fetchEmployees())
      setEmployeePage(0)
      setEmployeesVisible(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setViewingEmployees(false)
    }
  }

  async function onDeleteAllEmployees() {
    const confirmed = window.confirm(
      'Delete every employee and their join-event records? This cannot be undone.',
    )
    if (!confirmed) return
    setDeletingEmployees(true)
    setError('')
    setNotice('')
    try {
      const result = await deleteAllEmployees()
      setEmployees([])
      setEmployeeQuery('')
      setEmployeePage(0)
      setEmployeesVisible(false)
      const eventNote = result.deleted_events
        ? ` and ${result.deleted_events} join-event records`
        : ''
      setNotice(`${result.deleted_employees} employees${eventNote} deleted`)
      loadDeletionLogs()
    } catch (err) {
      setError(err.message)
    } finally {
      setDeletingEmployees(false)
    }
  }

  async function onEntry(event) {
    event.preventDefault()
    const employeeId = joinEmployeeId.trim()
    if (!employeeId) return
    setLookingUp(true)
    setError('')
    setNotice('')
    try {
      const [employee, attendees] = await Promise.all([
        fetchEmployee(employeeId),
        fetchJoinEvents(employeeId),
      ])
      setSelectedEmployee(employee)
      setExistingAttendees(attendees)
      setKidsNumber('')
      setMembers(
        attendees.some((row) => row.relation === 'Employee') || attendees.length >= employee.allowed_strength
          ? []
          : [{ key: crypto.randomUUID(), name: employee.employee_name, relation: 'Employee' }],
      )
      setView('join-employee')
      window.location.hash = `join-event/${encodeURIComponent(employee.employee_id)}`
    } catch (err) {
      setError(err.message)
    } finally {
      setLookingUp(false)
    }
  }

  function attendeeTotal(extra = 0) {
    return existingAttendees.length + members.length + extra
  }

  function addFamilyMember() {
    if (!selectedEmployee) return
    if (attendeeTotal() >= selectedEmployee.allowed_strength) {
      setError(`Allowed strength is ${selectedEmployee.allowed_strength}.`)
      return
    }
    setError('')
    setMembers((current) => {
      const employeeAlreadyAdded =
        current.some((member) => member.relation === 'Employee') ||
        existingAttendees.some((row) => row.relation === 'Employee')
      return [
        ...current,
        employeeAlreadyAdded
          ? { key: crypto.randomUUID(), name: '', relation: 'Father' }
          : { key: crypto.randomUUID(), name: selectedEmployee.employee_name, relation: 'Employee' },
      ]
    })
  }

  function maskLastThree(value) {
    const text = String(value || '')
    if (text.length <= 3) return '*'.repeat(text.length)
    return `${text.slice(0, -3)}***`
  }

  function isPrinted(row) {
    return String(row.print_status || '').trim().toLowerCase() === 'printed'
  }

  async function removeAttendee(eventId) {
    const row = existingAttendees.find((attendee) => attendee.unique_event_id === eventId)
    if (!row || isPrinted(row)) return
    setRemovingId(eventId)
    setError('')
    setNotice('')
    try {
      await deleteJoinEvent(eventId)
      setExistingAttendees((current) => current.filter((attendee) => attendee.unique_event_id !== eventId))
    } catch (err) {
      setError(err.message)
    } finally {
      setRemovingId(null)
    }
  }

  function updateMember(key, field, value) {
    setMembers((current) =>
      current.map((member) => (member.key === key ? { ...member, [field]: value } : member)),
    )
  }

  async function onSaveMembers(event) {
    event.preventDefault()
    if (!selectedEmployee) return
    const kids = kidsNumber.trim() === '' ? '0' : kidsNumber.trim()
    if (!/^\d+$/.test(kids)) {
      setError('Enter the number of children under 5 years.')
      return
    }
    const filledMembers = members.filter((member) => member.name.trim())
    if (filledMembers.length && existingAttendees.length + filledMembers.length > selectedEmployee.allowed_strength) {
      setError(`Allowed strength is ${selectedEmployee.allowed_strength}.`)
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const saved = await saveJoinEvent({
        employee_id: selectedEmployee.employee_id,
        kids_number: Number(kids),
        members: filledMembers.map((member) => ({
          name: member.name.trim(),
          relation: member.relation,
        })),
      })
      setMembers([])
      setExistingAttendees(await fetchJoinEvents(selectedEmployee.employee_id))
      const ids = saved.map((row) => row.unique_event_id).join(', ')
      const familyNote =
        saved.length === 0
          ? ''
          : ` Saved ${saved.length} family member${saved.length === 1 ? '' : 's'}. Event id ${ids}.`
      setNotice(`Saved ${kids} ${kids === '1' ? 'child' : 'children'} under 5 years.${familyNote}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function onAttendeeLogin(event) {
    event.preventDefault()
    const credentials = {
      company_code: attendeeCompany,
      department: attendeeDepartment,
      password: attendeePassword,
    }
    setLoggingIn(true)
    setError('')
    setNotice('')
    try {
      await loginAttendees(credentials)
      const rows = await fetchAttendees(credentials)
      setAttendeeSession(credentials)
      setAttendees(rows)
      setAttendeePage(0)
      setView('attendees-list')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoggingIn(false)
    }
  }

  function bulkCouponName(category, offset) {
    return `${category.guest_category}${category.prefix_number + offset}`
  }

  async function onSaveBulk(event) {
    event.preventDefault()
    const total = Number(bulkTotal)
    const category = categories.find((row) => String(row.id) === bulkCategoryId)
    if (!category || !bulkCompany || !bulkDepartment || !Number.isInteger(total) || total < 1 || total > 500) {
      setError('Choose a category, company, and department, and enter the total passes.')
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const saved = await saveBulkRegistration({
        category_id: category.id,
        company_code: bulkCompany,
        department: bulkDepartment,
        total_pass: total,
      })
      const first = saved[0]?.name
      const last = saved[saved.length - 1]?.name
      const names = saved.length > 1 ? `${first} to ${last}` : first
      const ids = saved.map((row) => row.unique_event_id).join(', ')
      setCategories(await fetchCategories())
      setBulkTotal('')
      setNotice(`Saved ${saved.length} pass${saved.length === 1 ? '' : 'es'}: ${names}. Event id ${ids}.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function showUnregisteredHousehold(rows, notice = '') {
    const employee = rows.find((row) => row.relation === 'Employee') || rows[0]
    setUnregHousehold(employee)
    setUnregAttendees(rows)
    setUnregMembers([])
    setView('unregistered-family')
    window.location.hash = `unregistered-employee/${encodeURIComponent(employee.unregistered_number)}`
    setError('')
    setNotice(notice)
  }

  async function onOpenUnregistered(event) {
    event.preventDefault()
    const number = unregLookup.trim()
    if (!number) return
    setLookingUp(true)
    setError('')
    setNotice('')
    try {
      const rows = await fetchUnregisteredHousehold(number)
      showUnregisteredHousehold(rows)
    } catch (err) {
      setError(err.message)
    } finally {
      setLookingUp(false)
    }
  }

  function unregAttendeeTotal(extra = 0) {
    return unregAttendees.length + unregMembers.length + extra
  }

  function addUnregFamily() {
    if (!unregHousehold) return
    if (unregAttendeeTotal() >= UNREGISTERED_ATTENDEE_LIMIT) {
      setError(
        `An unregistered employee can have only ${UNREGISTERED_ATTENDEE_LIMIT} attendees, including the employee.`,
      )
      return
    }
    setError('')
    setUnregMembers((current) => [...current, { key: crypto.randomUUID(), name: '', relation: 'Father' }])
  }

  function updateUnregMember(key, field, value) {
    setUnregMembers((current) =>
      current.map((member) => (member.key === key ? { ...member, [field]: value } : member)),
    )
  }

  async function removeUnregAttendee(eventId) {
    const row = unregAttendees.find((attendee) => attendee.unique_event_id === eventId)
    if (!row || isPrinted(row)) return
    setRemovingId(eventId)
    setError('')
    setNotice('')
    try {
      await deleteJoinEvent(eventId)
      setUnregAttendees((current) => current.filter((attendee) => attendee.unique_event_id !== eventId))
    } catch (err) {
      setError(err.message)
    } finally {
      setRemovingId(null)
    }
  }

  async function onSaveUnregistered(event) {
    event.preventDefault()
    if (!unregName.trim() || !unregDepartment || !unregCompany) {
      setError('Enter the employee name, company, and department.')
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const saved = await saveUnregisteredJoin({
        employee_name: unregName.trim(),
        department: unregDepartment,
        company_code: unregCompany,
      })
      const employee = saved.find((row) => row.relation === 'Employee') || saved[0]
      setUnregName('')
      setUnregCompany(UNREGISTERED_COMPANY)
      setUnregDepartment('')
      showUnregisteredHousehold(
        saved,
        `Saved ${employee.name} as unregistered employee ${employee.unregistered_number}. Add family members below.`,
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function onSaveUnregFamily(event) {
    event.preventDefault()
    if (!unregHousehold || unregMembers.length === 0) return
    const filledMembers = unregMembers.filter((member) => member.name.trim())
    if (filledMembers.length === 0) {
      setUnregMembers([])
      setError('Enter a family member name.')
      return
    }
    if (unregAttendees.length + filledMembers.length > UNREGISTERED_ATTENDEE_LIMIT) {
      setError(
        `An unregistered employee can have only ${UNREGISTERED_ATTENDEE_LIMIT} attendees, including the employee.`,
      )
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const saved = await saveUnregisteredFamily({
        unregistered_number: unregHousehold.unregistered_number,
        members: filledMembers.map((member) => ({
          name: member.name.trim(),
          relation: member.relation,
        })),
      })
      const rows = await fetchUnregisteredHousehold(unregHousehold.unregistered_number)
      setUnregAttendees(rows)
      setUnregMembers([])
      const ids = saved.map((row) => row.unique_event_id).join(', ')
      setNotice(
        `Saved ${saved.length} family member${saved.length === 1 ? '' : 's'} under ${unregHousehold.unregistered_number}. Event id ${ids}.`,
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function onRejectAll() {
    if (!attendeeSession || approvingAll || rejectingAll) return
    const eventIds = pagedAttendees.filter((row) => !isPrinted(row)).map((row) => row.unique_event_id)
    if (eventIds.length === 0) {
      setError('Printed passes cannot be rejected.')
      return
    }
    const skippedPrinted = pagedAttendees.length - eventIds.length
    setRejectingAll(true)
    setError('')
    setNotice('')
    try {
      const rows = await rejectAllAttendees({
        ...attendeeSession,
        event_ids: eventIds,
      })
      setAttendees(rows)
      setNotice(
        skippedPrinted
          ? 'Rejected the join event entries on this page. Printed passes were left unchanged.'
          : 'Rejected every join event entry on this page.',
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setRejectingAll(false)
    }
  }

  async function onApproveAll() {
    if (!attendeeSession || approvingAll || rejectingAll) return
    setApprovingAll(true)
    setError('')
    setNotice('')
    try {
      const rows = await approveAllAttendees({
        ...attendeeSession,
        event_ids: pagedAttendees.map((row) => row.unique_event_id),
      })
      setAttendees(rows)
      setNotice('Approved every join event entry on this page.')
    } catch (err) {
      setError(err.message)
    } finally {
      setApprovingAll(false)
    }
  }

  async function onDecide(eventId, approveStatus) {
    if (!attendeeSession) return
    const row = attendees.find((attendee) => attendee.unique_event_id === eventId)
    if (approveStatus === 'Rejected' && row && isPrinted(row)) {
      setError('Printed passes cannot be rejected.')
      return
    }
    setError('')
    try {
      const updated = await decideAttendee(eventId, {
        ...attendeeSession,
        approve_status: approveStatus,
      })
      setAttendees((current) =>
        current.map((row) => (row.unique_event_id === eventId ? updated : row)),
      )
    } catch (err) {
      setError(err.message)
    }
  }

  if (!portalPath() && !sessionReady) {
    return (
      <div className="app is-portal">
        <main className="workspace">
          <PageHeader />
          <p className="empty">Checking session…</p>
        </main>
      </div>
    )
  }

  if (!portalPath() && !sessionUser) {
    return (
      <div className="app is-portal">
        <main className="workspace is-login">
          <PageHeader />
          <section className="add-section is-compact login-panel">
            <h2>Sign in</h2>
            <form onSubmit={onAppLogin}>
              <label>
                User Name
                <input
                  value={loginUsername}
                  onChange={(event) => setLoginUsername(event.target.value)}
                  autoComplete="username"
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
              {loginError && (
                <div className="banner" role="alert">
                  <p>{loginError}</p>
                </div>
              )}
              <button type="submit" className="primary" disabled={signingIn}>
                {signingIn ? 'Signing in…' : 'Login'}
              </button>
            </form>
          </section>
        </main>
      </div>
    )
  }

  return (
    <div
      className={
        gatePortalPath()
          ? 'app is-portal is-gate'
          : portalPath()
            ? 'app is-portal'
            : view === 'gate' || view === 'meals'
              ? 'app is-gate'
              : 'app'
      }
    >
      {portalPath() ? null : (
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-logo" src="/sreedhareeyam-logo.png" alt="" />
          <p className="wordmark">Sreedhareeyam</p>
          <p className="tagline">Annual Day 2026</p>
        </div>

        <nav className="nav" aria-label="Masters">
          <a
            className={view === 'companies' ? 'nav-link is-active' : 'nav-link'}
            href="#add-company"
            onClick={showCompanies}
          >
            Add Company
          </a>
          <a
            className={view === 'departments' ? 'nav-link is-active' : 'nav-link'}
            href="#department"
            onClick={showDepartments}
          >
            Department
          </a>
          <a
            className={view === 'employees' ? 'nav-link is-active' : 'nav-link'}
            href="#employee-upload"
            onClick={showEmployees}
          >
            Employee Upload
          </a>
          <a
            className={
              view === 'registration' || view === 'join' || view === 'join-employee' || view === 'unregistered' || view === 'unregistered-family'
                ? 'nav-link is-active'
                : 'nav-link'
            }
            href="#employee-registration"
            onClick={showRegistration}
          >
            Employee Registration
          </a>
          <a
            className={view === 'bulk' ? 'nav-link is-active' : 'nav-link'}
            href="#bulk-registration"
            onClick={showBulk}
          >
            Bulk Registration
          </a>
          <a
            className={view === 'attendees' || view === 'attendees-list' ? 'nav-link is-active' : 'nav-link'}
            href="#view-attendees"
            onClick={showAttendees}
          >
            Line Manager Approval
          </a>
          <a
            className={view === 'passes' ? 'nav-link is-active' : 'nav-link'}
            href="#print-pass"
            onClick={showPasses}
          >
            Print Pass
          </a>
          <a
            className={view === 'reprints' ? 'nav-link is-active' : 'nav-link'}
            href="#reprint-pass"
            onClick={showReprints}
          >
            Reprint Pass
          </a>
          <a
            className={view === 'gate' ? 'nav-link is-active' : 'nav-link'}
            href="#entry-gate"
            onClick={showGate}
          >
            Entry Gate
          </a>
          <a
            className={view === 'meals' ? 'nav-link is-active' : 'nav-link'}
            href="#meals-gate"
            onClick={showMeals}
          >
            Meals Gate
          </a>
          <a
            className={view === 'report' ? 'nav-link is-active' : 'nav-link'}
            href="#final-report"
            onClick={showReport}
          >
            Report
          </a>
          <a
            className={view === 'summary' ? 'nav-link is-active' : 'nav-link'}
            href="#registration-summary"
            onClick={showSummary}
          >
            Registration Summary
          </a>
          <a
            className={view === 'admin' ? 'nav-link is-active' : 'nav-link'}
            href="#admin"
            onClick={showAdmin}
          >
            Admin
          </a>
        </nav>
        <button type="button" className="nav-link logout" onClick={onAppLogout}>
          Log out
        </button>
      </aside>
      )}

      <main className={view === 'registration' ? 'workspace is-chooser' : 'workspace'}>
        <PageHeader title={view === 'join' ? 'Employee Registration' : ''} />
        {view === 'registration' && (
          <div className="registration-center">
            <section className="registration-access">
              <div className="registration-actions">
                <button type="button" className="primary" onClick={showJoin}>
                  Employee
                </button>
                <button type="button" className="primary" onClick={showUnregistered}>
                  Unregistered Employee
                </button>
              </div>
            </section>
          </div>
        )}
        {view === 'unregistered' && (
          <section className="add-section is-compact" id="unregistered-employee">
            <h1>Unregistered Employee Registration</h1>
            {notice && view === 'unregistered' && (
              <div className="banner success" role="status">
                <p>{notice}</p>
              </div>
            )}
            {error && view === 'unregistered' && (
              <div className="banner" role="alert">
                <p>{error}</p>
              </div>
            )}
            <div className="unreg-choice">
              <div className="unreg-panel">
                <div className="unreg-panel-head">
                  <h2>Unregistered Employee</h2>
                  <button
                    type="button"
                    className="help-link"
                    aria-expanded={unregHelp}
                    onClick={() => setUnregHelp((open) => !open)}
                  >
                    Help
                  </button>
                </div>
                {unregHelp && (
                  <p className="hint-text">
                    Fill the name and department, then press Save. Leave the number blank. A number such as UR3 is given after the employee is saved.
                  </p>
                )}
                <form id="unregistered-save" className="member-form" onSubmit={onSaveUnregistered}>
                  <div className="unreg-fields">
                    <label className="kids-field">
                      Employee name
                      <input
                        value={unregName}
                        onChange={(event) => setUnregName(event.target.value)}
                        maxLength={200}
                        required
                        placeholder="Full name"
                      />
                    </label>
                    <label className="kids-field">
                      Company
                      <select
                        value={UNREGISTERED_COMPANY}
                        onChange={() => {
                          setUnregCompany(UNREGISTERED_COMPANY)
                          setUnregDepartment('')
                        }}
                        required
                      >
                        <option value={UNREGISTERED_COMPANY}>{UNREGISTERED_COMPANY}</option>
                      </select>
                    </label>
                    <label className="kids-field">
                      Department
                      <select
                        value={unregDepartment}
                        onChange={(event) => setUnregDepartment(event.target.value)}
                        required
                      >
                        <option value="">Select department</option>
                        {unregDepartments
                          .filter((row) => row.company_code === UNREGISTERED_COMPANY)
                          .map((row) => (
                            <option key={row.department} value={row.department}>
                              {row.department}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                  <button type="submit" className="primary" disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </form>
              </div>
              <div className="unreg-panel">
                <h2>Open an employee who already has a number</h2>
                <p className="hint-text">
                  Use this only when the employee was registered before. Type the number you were given, such as UR3, then press Open to add family members.
                </p>
                <form className="upload-form unreg-lookup" onSubmit={onOpenUnregistered}>
                  <label>
                    Given number
                    <input
                      value={unregLookup}
                      onChange={(event) => setUnregLookup(event.target.value)}
                      required
                      maxLength={20}
                      placeholder="UR3"
                    />
                  </label>
                  <button type="submit" className="primary" disabled={lookingUp}>
                    {lookingUp ? 'Finding…' : 'Open'}
                  </button>
                </form>
              </div>
            </div>
          </section>
        )}
        {view === 'unregistered-family' && unregHousehold && (
          <section className="add-section is-compact" id="unregistered-family">
            <h2>Unregistered Employee Registration</h2>
            <dl className="details">
              <div>
                <dt>Unregistered number</dt>
                <dd>{unregHousehold.unregistered_number}</dd>
              </div>
              <div>
                <dt>Employee name</dt>
                <dd>{unregHousehold.employee_name || unregHousehold.name}</dd>
              </div>
              <div>
                <dt>Department</dt>
                <dd>{unregHousehold.department}</dd>
              </div>
              <div>
                <dt>Company</dt>
                <dd>{unregHousehold.company}</dd>
              </div>
              <div>
                <dt>Allowed strength</dt>
                <dd>{UNREGISTERED_ATTENDEE_LIMIT}</dd>
              </div>
            </dl>
            <div className="kids-row">
              <button
                type="button"
                className="primary rectangle"
                onClick={addUnregFamily}
                disabled={unregAttendeeTotal() >= UNREGISTERED_ATTENDEE_LIMIT}
              >
                Add Family Member
              </button>
            </div>
            {unregAttendees.some((attendee) => attendee.relation !== 'Employee') && (
              <div className="attendee-block">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Relation</th>
                        <th>Print</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {unregAttendees
                        .filter((attendee) => attendee.relation !== 'Employee')
                        .map((attendee) => {
                        const printed = isPrinted(attendee)
                        return (
                          <tr key={attendee.unique_event_id}>
                            <td>{maskLastThree(attendee.name)}</td>
                            <td>{'*'.repeat(String(attendee.relation || '').length)}</td>
                            <td>
                              <span className={`status status-${attendee.print_status.toLowerCase()}`}>
                                {attendee.print_status}
                              </span>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="member-remove"
                                disabled={printed || removingId === attendee.unique_event_id}
                                title={printed ? 'Printed passes cannot be removed' : 'Remove attendee'}
                                onClick={() => removeUnregAttendee(attendee.unique_event_id)}
                              >
                                {printed ? 'Locked' : removingId === attendee.unique_event_id ? 'Removing…' : 'Remove'}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <form id="unregistered-family-save" className="member-form" onSubmit={onSaveUnregFamily}>
              {unregMembers.length > 0 && (
                <div className="member-header" aria-hidden="true">
                  <span>Name</span>
                  <span>Relation</span>
                </div>
              )}
              {unregMembers.map((member) => (
                <div key={member.key} className="member-row">
                  <input
                    aria-label="Name"
                    value={member.name}
                    onChange={(event) => updateUnregMember(member.key, 'name', event.target.value)}
                    maxLength={200}
                    placeholder="Name"
                    required
                  />
                  <select
                    aria-label="Relation"
                    value={member.relation}
                    onChange={(event) => updateUnregMember(member.key, 'relation', event.target.value)}
                  >
                    {RELATIONS.filter((relation) => relation !== 'Employee').map((relation) => (
                      <option key={relation} value={relation}>
                        {relation}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              {notice && (
                <div className="banner success" role="status">
                  <p>{notice}</p>
                </div>
              )}
              {error && (
                <div className="banner" role="alert">
                  <p>{error}</p>
                </div>
              )}
              <button type="submit" className="primary" disabled={saving || unregMembers.length === 0}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </form>
          </section>
        )}

        {view === 'bulk' && (
          <section className="add-section" id="bulk-registration">
            <h2>Bulk registration</h2>
            <form id="bulk-save" className="member-form" onSubmit={onSaveBulk}>
              <div className="bulk-fields">
                <label className="kids-field">
                  Category
                  <select
                    value={bulkCategoryId}
                    onChange={(event) => setBulkCategoryId(event.target.value)}
                    required
                  >
                    <option value="">Select category</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.guest_category}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="kids-field">
                  Company
                  <select
                    value={bulkCompany}
                    onChange={(event) => {
                      setBulkCompany(event.target.value)
                      setBulkDepartment('')
                    }}
                    required
                  >
                    <option value="">Select company</option>
                    {companies.map((company) => (
                      <option key={company.company_code} value={company.company_code}>
                        {company.company_code}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="kids-field">
                  Department
                  <select
                    value={bulkDepartment}
                    onChange={(event) => setBulkDepartment(event.target.value)}
                    required
                    disabled={!bulkCompany}
                  >
                    <option value="">Select department</option>
                    {bulkDepartments
                      .filter((row) => row.company_code === bulkCompany)
                      .map((row) => (
                        <option key={row.department} value={row.department}>
                          {row.department}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="kids-field">
                  Name
                  <input
                    value={(() => {
                      const category = categories.find((row) => String(row.id) === bulkCategoryId)
                      if (!category) return ''
                      const first = bulkCouponName(category, 1)
                      const total = Number(bulkTotal)
                      if (!Number.isInteger(total) || total < 1) return first
                      if (total === 1) return first
                      return `${first} to ${bulkCouponName(category, total)}`
                    })()}
                    readOnly
                    placeholder="Guest1"
                  />
                </label>
                <label className="kids-field">
                  Total pass
                  <input
                    value={bulkTotal}
                    onChange={(event) => setBulkTotal(event.target.value.replace(/\D/g, '').slice(0, 3))}
                    inputMode="numeric"
                    maxLength={3}
                    placeholder="1"
                    required
                  />
                </label>
              </div>

              {notice && (
                <div className="banner success" role="status">
                  <p>{notice}</p>
                </div>
              )}
              {error && (
                <div className="banner" role="alert">
                  <p>{error}</p>
                </div>
              )}
              <button type="submit" className="primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </form>
          </section>
        )}

        {view === 'companies' && (
          <>
        <section className="add-section" id="add-company">
          <h2>{editingCompany ? 'Edit company' : 'Add company'}</h2>
          <form className="composer" onSubmit={onSubmit}>
            <label>
              Company code
              <input
                name="company_code"
                value={form.company_code}
                onChange={updateField}
                maxLength={50}
                required
                placeholder="SAEH"
              />
            </label>
            <label>
              Company name
              <input
                name="company_name"
                value={form.company_name}
                onChange={updateField}
                maxLength={200}
                required
                placeholder="SAEH"
              />
            </label>
            <div className="composer-actions">
              <button type="submit" className="primary" disabled={saving}>
                {saving ? 'Saving…' : editingCompany ? 'Save' : 'Add company'}
              </button>
              {editingCompany && (
                <button type="button" className="quiet" onClick={cancelEditCompany} disabled={saving}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>

        <header className="toolbar">
          <div>
            <h2>Companies</h2>
            <p className="count">{loading ? 'Loading…' : `${companies.length} in company_master`}</p>
          </div>
          <label className="search">
            <span className="visually-hidden">Search companies</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search code or name"
            />
          </label>
        </header>

        {notice && (
          <div className="banner success" role="status">
            <p>{notice}</p>
          </div>
        )}
        {error && (
          <div className="banner" role="alert">
            <p>{error}</p>
          </div>
        )}

        {loading ? (
          <p className="empty">Loading companies…</p>
        ) : error && companies.length === 0 ? null : visible.length === 0 ? (
          <p className="empty">
            {companies.length === 0 ? 'No companies yet.' : 'No companies match this search.'}
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Company code</th>
                  <th>Company name</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((company) => (
                  <tr
                    key={company.company_code}
                    className={editingCompany === company.company_code ? 'is-editing' : undefined}
                  >
                    <td>{company.company_code}</td>
                    <td>{company.company_name}</td>
                    <td>
                      <button type="button" className="primary rectangle" onClick={() => onEditCompany(company)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
          </>
        )}

        {view === 'departments' && (
          <>
            <section className="add-section" id="department">
              <h2>Add department</h2>
              <form className="member-form" onSubmit={onAddDepartment}>
                <div className="department-fields">
                  <label className="kids-field">
                    Company
                    <select
                      value={deptCompany}
                      onChange={(event) => setDeptCompany(event.target.value)}
                      required
                    >
                      <option value="">Select company</option>
                      {companies.map((company) => (
                        <option key={company.company_code} value={company.company_code}>
                          {company.company_code}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="kids-field">
                    Department
                    <input
                      value={deptName}
                      onChange={(event) => setDeptName(event.target.value)}
                      maxLength={100}
                      required
                    />
                  </label>
                  <label className="kids-field">
                    Password
                    <input
                      value={deptPassword}
                      onChange={(event) => setDeptPassword(event.target.value)}
                      maxLength={50}
                      required
                    />
                  </label>
                  <button type="submit" className="primary rectangle" disabled={saving}>
                    {saving ? 'Saving…' : 'Add'}
                  </button>
                </div>
              </form>
            </section>

            <header className="toolbar">
              <div>
                <h2>Departments</h2>
                <p className="count">{`${departmentRows.length} in department`}</p>
              </div>
              <label className="search">
                <span className="visually-hidden">Search departments</span>
                <input
                  value={deptQuery}
                  onChange={(event) => setDeptQuery(event.target.value)}
                  placeholder="Search company or department"
                />
              </label>
            </header>

            {notice && (
              <div className="banner success" role="status">
                <p>{notice}</p>
              </div>
            )}
            {error && (
              <div className="banner" role="alert">
                <p>{error}</p>
              </div>
            )}

            {departmentRows.length === 0 ? (
              <p className="empty">No departments yet.</p>
            ) : visibleDepartments.length === 0 ? (
              <p className="empty">No departments match this search.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Department</th>
                      <th>Password</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleDepartments.map((row) => {
                      const key = departmentKey(row)
                      return (
                        <tr key={key}>
                          <td>{row.company_code}</td>
                          <td>{row.department}</td>
                          <td>
                            <div className="password-edit">
                              <input
                                value={deptPasswords[key] ?? ''}
                                maxLength={50}
                                aria-label={`Password for ${row.department}`}
                                onChange={(event) =>
                                  setDeptPasswords((current) => ({ ...current, [key]: event.target.value }))
                                }
                              />
                              <button
                                type="button"
                                className="primary rectangle"
                                disabled={updatingDepartmentKey === key}
                                onClick={() => onUpdateDepartmentPassword(row)}
                              >
                                {updatingDepartmentKey === key ? 'Saving…' : 'Update'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {view === 'employees' && (
          <>
            <section className="add-section" id="employee-upload">
              <h2>Employee upload</h2>
              <p className="hint-text">
                The first row of the Excel file must be EmployeeId, EmployeeName, Department, Mobile,
                CompanyCode, and AllowedStrength. Leave Mobile blank when there is no number. CompanyCode
                must already exist in the company master.
              </p>
              <form className="upload-form" onSubmit={onUpload}>
                <label>
                  Excel file
                  <input
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(event) => setFile(event.target.files?.[0] || null)}
                  />
                </label>
                <button type="submit" className="primary" disabled={!file || uploading}>
                  {uploading ? 'Uploading…' : 'Upload'}
                </button>
              </form>
              <div className="upload-actions">
                <button type="button" className="primary" onClick={onViewEmployees} disabled={viewingEmployees}>
                  {viewingEmployees ? 'Loading…' : 'View'}
                </button>
              </div>
            </section>

            {notice && (
              <div className="banner success" role="status">
                <p>{notice}</p>
              </div>
            )}
            {error && (
              <div className="banner" role="alert">
                <p>{error}</p>
              </div>
            )}

            {employeesVisible && (
            <>
            <header className="toolbar employee-toolbar">
              <div>
                <h2>Employees</h2>
                <p className="count">{viewingEmployees ? 'Loading…' : `${employees.length} in EmployeeMaster`}</p>
              </div>
              <label className="search">
                <span className="visually-hidden">Search employees</span>
                <input
                  value={employeeQuery}
                  onChange={(event) => {
                    setEmployeeQuery(event.target.value)
                    setEmployeePage(0)
                  }}
                  placeholder="Search employees"
                />
              </label>
              {visibleEmployees.length > 0 && (
                <div className="pager">
                  <button
                    type="button"
                    onClick={() => setEmployeePage((page) => Math.max(0, page - 1))}
                    disabled={currentEmployeePage === 0}
                  >
                    Previous
                  </button>
                  <p>
                    {employeeRangeStart}–{employeeRangeEnd} of {visibleEmployees.length}
                  </p>
                  <button
                    type="button"
                    onClick={() => setEmployeePage((page) => Math.min(employeePageCount - 1, page + 1))}
                    disabled={currentEmployeePage >= employeePageCount - 1}
                  >
                    Next
                  </button>
                </div>
              )}
            </header>

            {viewingEmployees ? (
              <p className="empty">Loading employees…</p>
            ) : visibleEmployees.length === 0 ? (
              <p className="empty">
                {employees.length === 0 ? 'No employees uploaded yet.' : 'No employees match this search.'}
              </p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Employee ID</th>
                      <th>Employee name</th>
                      <th>Department</th>
                      <th>Mobile</th>
                      <th>Company code</th>
                      <th>Allowed strength</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedEmployees.map((employee) => (
                      <tr key={employee.employee_id}>
                        <td>{employee.employee_id}</td>
                        <td>{employee.employee_name}</td>
                        <td>{employee.department}</td>
                        <td>{employee.mobile}</td>
                        <td>{employee.company_code}</td>
                        <td>
                          <div className="password-edit">
                            <input
                              type="number"
                              min="0"
                              value={strengthDrafts[employee.employee_id] ?? String(employee.allowed_strength)}
                              onChange={(event) =>
                                setStrengthDrafts((current) => ({
                                  ...current,
                                  [employee.employee_id]: event.target.value,
                                }))
                              }
                              aria-label={`Allowed strength for ${employee.employee_name}`}
                            />
                            <button
                              type="button"
                              onClick={() => onUpdateEmployeeStrength(employee)}
                              disabled={updatingStrengthId === employee.employee_id}
                            >
                              {updatingStrengthId === employee.employee_id ? 'Saving…' : 'Update'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            </>
            )}
          </>
        )}

        {view === 'join' && (
          <section className="add-section is-compact" id="join-event">
            <form className="upload-form" onSubmit={onEntry}>
              <label>
                Employee ID
                <input
                  value={joinEmployeeId}
                  onChange={(event) => setJoinEmployeeId(event.target.value)}
                  required
                  maxLength={50}
                  placeholder="1001"
                />
              </label>
              <button type="submit" className="primary" disabled={lookingUp}>
                {lookingUp ? 'Finding…' : 'Entry'}
              </button>
            </form>
            {error && (
              <div className="banner" role="alert">
                <p>{error}</p>
              </div>
            )}
          </section>
        )}

        {view === 'join-employee' && selectedEmployee && (
          <section className="add-section is-compact" id="employee-page">
            <h2>Employee Registration</h2>
            <dl className="details">
              <div>
                <dt>Employee ID</dt>
                <dd>{selectedEmployee.employee_id}</dd>
              </div>
              <div>
                <dt>Employee name</dt>
                <dd>{selectedEmployee.employee_name}</dd>
              </div>
              <div>
                <dt>Department</dt>
                <dd>{selectedEmployee.department}</dd>
              </div>
              <div>
                <dt>Mobile</dt>
                <dd>{selectedEmployee.mobile || '—'}</dd>
              </div>
              <div>
                <dt>Company code</dt>
                <dd>{selectedEmployee.company_code}</dd>
              </div>
              <div>
                <dt>Allowed strength</dt>
                <dd>{selectedEmployee.allowed_strength}</dd>
              </div>
            </dl>
            <div className="kids-row">
              <label className="kids-field">
                No of Children Under 5 Years
                <input
                  form="member-save"
                  value={kidsNumber}
                  onChange={(event) => setKidsNumber(event.target.value.replace(/\D/g, '').slice(0, 2))}
                  inputMode="numeric"
                  maxLength={2}
                  aria-label="No of Children Under 5 Years"
                />
              </label>
              <button
                type="button"
                className="primary rectangle"
                onClick={addFamilyMember}
                disabled={existingAttendees.length + members.length >= selectedEmployee.allowed_strength}
              >
                Add Family Member
              </button>
            </div>

            {existingAttendees.length > 0 && (
              <div className="attendee-block">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Relation</th>
                        <th>Print</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {existingAttendees.map((attendee) => {
                        const printed = isPrinted(attendee)
                        return (
                          <tr key={attendee.unique_event_id}>
                            <td>{maskLastThree(attendee.name)}</td>
                            <td>{'*'.repeat(String(attendee.relation || '').length)}</td>
                            <td>
                              <span className={`status status-${attendee.print_status.toLowerCase()}`}>
                                {attendee.print_status}
                              </span>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="member-remove"
                                disabled={printed || removingId === attendee.unique_event_id}
                                title={printed ? 'Printed passes cannot be removed' : 'Remove attendee'}
                                onClick={() => removeAttendee(attendee.unique_event_id)}
                              >
                                {printed ? 'Locked' : removingId === attendee.unique_event_id ? 'Removing…' : 'Remove'}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <form id="member-save" className="member-form" onSubmit={onSaveMembers}>
              {members.length > 0 && (
                <div className="member-header" aria-hidden="true">
                  <span>Name</span>
                  <span>Relation</span>
                </div>
              )}
              {members.map((member, index) => {
                const employeeAlreadyAttendee =
                  existingAttendees.some((row) => row.relation === 'Employee') ||
                  members.some((row, rowIndex) => row.relation === 'Employee' && rowIndex !== index)
                const relations = employeeAlreadyAttendee
                  ? RELATIONS.filter((relation) => relation !== 'Employee')
                  : RELATIONS
                return (
                <div key={member.key} className="member-row">
                  <input
                    aria-label="Name"
                    value={member.name}
                    onChange={(event) => updateMember(member.key, 'name', event.target.value)}
                    maxLength={200}
                    placeholder="Name"
                    required
                  />
                  <select
                    aria-label="Relation"
                    value={member.relation}
                    onChange={(event) => updateMember(member.key, 'relation', event.target.value)}
                  >
                    {relations.map((relation) => (
                      <option key={relation} value={relation}>
                        {relation}
                      </option>
                    ))}
                  </select>
                </div>
                )
              })}

              {notice && (
                <div className="banner success" role="status">
                  <p>{notice}</p>
                </div>
              )}
              {error && (
                <div className="banner" role="alert">
                  <p>{error}</p>
                </div>
              )}

              <button
                type="submit"
                className="primary"
                disabled={saving || (members.length === 0 && kidsNumber === '')}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </form>
          </section>
        )}

        {view === 'attendees' && (
          <section className={approvalPortalPath() ? 'add-section is-compact' : 'add-section'} id="view-attendees">
            <h2>Line Manager Approval</h2>
            <form className="attendee-login" onSubmit={onAttendeeLogin}>
              <label>
                Company code
                <select
                  value={attendeeCompany}
                  onChange={(event) => onAttendeeCompany(event.target.value)}
                  required
                >
                  <option value="">Select company</option>
                  {companies.map((company) => (
                    <option key={company.company_code} value={company.company_code}>
                      {company.company_code}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Department
                <select
                  value={attendeeDepartment}
                  onChange={(event) => setAttendeeDepartment(event.target.value)}
                  required
                  disabled={!attendeeCompany}
                >
                  <option value="">Select department</option>
                  {departmentOptions.map((row) => (
                    <option key={row.department} value={row.department}>
                      {row.department}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={attendeePassword}
                  onChange={(event) => setAttendeePassword(event.target.value)}
                  required
                />
              </label>
              <button type="submit" className="primary rectangle" disabled={loggingIn}>
                {loggingIn ? 'Checking…' : 'Login'}
              </button>
            </form>
            {error && (
              <div className="banner" role="alert">
                <p>{error}</p>
              </div>
            )}
          </section>
        )}

        {view === 'attendees-list' && attendeeSession && (
          <section className={approvalPortalPath() ? 'add-section is-compact' : 'add-section'}>
            <div className="approval-toolbar">
              <h2>
                {attendeeSession.department} · {attendeeSession.company_code}
              </h2>
              <div className="pager">
                <button
                  type="button"
                  onClick={() => setAttendeePage((page) => Math.max(0, page - 1))}
                  disabled={currentAttendeePage === 0}
                >
                  Previous
                </button>
                <p>
                  {attendeeRangeStart}–{attendeeRangeEnd} of {attendees.length}
                </p>
                <button
                  type="button"
                  onClick={() => setAttendeePage((page) => Math.min(attendeePageCount - 1, page + 1))}
                  disabled={currentAttendeePage >= attendeePageCount - 1}
                >
                  Next
                </button>
                <button
                  type="button"
                  className="primary rectangle"
                  onClick={onApproveAll}
                  disabled={
                    approvingAll ||
                    rejectingAll ||
                    pagedAttendees.length === 0 ||
                    pagedAttendees.every((row) => row.approve_status === 'Approved')
                  }
                >
                  {approvingAll ? 'Approving…' : 'Approve All'}
                </button>
                <button
                  type="button"
                  className="decision reject rectangle"
                  onClick={onRejectAll}
                  disabled={
                    approvingAll ||
                    rejectingAll ||
                    !pagedAttendees.some((row) => !isPrinted(row) && row.approve_status !== 'Rejected')
                  }
                >
                  {rejectingAll ? 'Rejecting…' : 'Reject All'}
                </button>
              </div>
            </div>
            <p className="count">{attendees.length} join event entries</p>
            {notice && (
              <div className="banner success" role="status">
                <p>{notice}</p>
              </div>
            )}
            {error && (
              <div className="banner" role="alert">
                <p>{error}</p>
              </div>
            )}
            {attendees.length === 0 ? (
              <p className="empty">No join event entries for this department.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Event id</th>
                      <th>Employee ID</th>
                      <th>Unregistered number</th>
                      <th>Employee name</th>
                      <th>Name</th>
                      <th>Relation</th>
                      <th>Approve status</th>
                      <th>Print status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedAttendees.map((row) => (
                      <tr key={row.unique_event_id}>
                        <td>{row.unique_event_id}</td>
                        <td>{row.employee_id || '—'}</td>
                        <td>{row.unregistered_number || '—'}</td>
                        <td>{row.employee_name}</td>
                        <td>{row.name}</td>
                        <td>{row.relation}</td>
                        <td>
                          <span className={`status status-${row.approve_status.toLowerCase()}`}>
                            {row.approve_status}
                          </span>
                        </td>
                        <td>{row.print_status}</td>
                        <td className="decision-cell">
                          <button
                            type="button"
                            className={
                              row.approve_status === 'Approved'
                                ? 'decision approve is-approved'
                                : 'decision approve'
                            }
                            onClick={() => onDecide(row.unique_event_id, 'Approved')}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="decision reject"
                            disabled={isPrinted(row)}
                            title={isPrinted(row) ? 'Printed passes cannot be rejected' : 'Reject'}
                            onClick={() => onDecide(row.unique_event_id, 'Rejected')}
                          >
                            Reject
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {view === 'passes' && (
          <section className="add-section" id="print-pass">
            <h2>Print pass</h2>
            <form className="attendee-login pass-filters" onSubmit={onViewPasses}>
              <label>
                Company code
                <select value={passCompany} onChange={(event) => onPassCompany(event.target.value)} required>
                  <option value="">Select company</option>
                  <option value="*">All companies</option>
                  {companies.map((company) => (
                    <option key={company.company_code} value={company.company_code}>
                      {company.company_code}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Department
                <select
                  value={passDepartment}
                  onChange={(event) => {
                    const value = event.target.value
                    setPassDepartment(value)
                    setPasses([])
                    setPassesLoaded(false)
                    setPassPage(0)
                    setSelectedPassIds([])
                    if (value) loadPrintPasses(passCompany, value)
                  }}
                  required
                  disabled={!passCompany}
                >
                  <option value="">Select department</option>
                  {passCompany && <option value="*">All departments</option>}
                  {passDepartments.map((row) => {
                    const value = passCompany === '*' ? `${row.company_code}\u001f${row.department}` : row.department
                    return (
                      <option key={`${row.company_code}\u001f${row.department}`} value={value}>
                        {passCompany === '*' ? `${row.company_code} — ${row.department}` : row.department}
                      </option>
                    )
                  })}
                </select>
              </label>
              <button type="submit" className="primary rectangle" disabled={viewingPasses}>
                {viewingPasses ? 'Loading…' : 'View'}
              </button>
            </form>
            {error && (
              <div className="banner" role="alert">
                <p>{error}</p>
              </div>
            )}
            {notice && (
              <div className="banner success" role="status">
                <p>{notice}</p>
              </div>
            )}
            {passesLoaded && passes.length === 0 && (
              <p className="empty">
                {passDepartment === '*'
                  ? 'No approved passes are waiting to print.'
                  : 'No approved join entries for this department.'}
              </p>
            )}
            {passes.length > 0 && (
              <>
                <div className="pass-toolbar">
                  <label className="select-all">
                    <input
                      type="checkbox"
                      checked={selectedPassIds.length === passes.length}
                      onChange={toggleAllPasses}
                    />
                    Select all
                  </label>
                  <span className="count">{selectedPassIds.length} selected</span>
                  <div className="pager">
                    <button
                      type="button"
                      onClick={() => setPassPage((page) => Math.max(0, page - 1))}
                      disabled={currentPassPage === 0}
                    >
                      Previous
                    </button>
                    <p>
                      {passRangeStart}–{passRangeEnd} of {passes.length}
                    </p>
                    <button
                      type="button"
                      onClick={() => setPassPage((page) => Math.min(passPageCount - 1, page + 1))}
                      disabled={currentPassPage >= passPageCount - 1}
                    >
                      Next
                    </button>
                  </div>
                  <button
                    type="button"
                    className="primary rectangle"
                    disabled={!selectedPassIds.length || printingPasses}
                    onClick={onPrintPasses}
                  >
                    {printingPasses ? 'Preparing…' : 'Print'}
                  </button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th></th>
                        <th>Event id</th>
                        {(passCompany === '*' || passDepartment === '*') && <th>Company</th>}
                        {(passCompany === '*' || passDepartment === '*') && <th>Department</th>}
                        <th>Employee code</th>
                        <th>Unregistered number</th>
                        <th>Staff name</th>
                        <th>Attendee</th>
                        <th>Relation</th>
                        <th>Print status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedPasses.map((row) => (
                        <tr key={row.unique_event_id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedPassIds.includes(row.unique_event_id)}
                              onChange={() => togglePass(row.unique_event_id)}
                              aria-label={`Select ${row.name}`}
                            />
                          </td>
                          <td>{row.unique_event_id}</td>
                          {(passCompany === '*' || passDepartment === '*') && <td>{row.company_code}</td>}
                          {(passCompany === '*' || passDepartment === '*') && <td>{row.department}</td>}
                          <td>{row.employee_id || '—'}</td>
                          <td>{row.unregistered_number || '—'}</td>
                          <td>{row.employee_name}</td>
                          <td>{row.name}</td>
                          <td>{row.relation}</td>
                          <td>
                            <span className={`status status-${row.print_status.toLowerCase()}`}>
                              {row.print_status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        )}

        {view === 'reprints' && (
          <section className="add-section" id="reprint-pass">
            <h2>Reprint pass</h2>
            <form className="attendee-login pass-filters" onSubmit={onViewReprints}>
              <label>
                Company code
                <select value={reprintCompany} onChange={(event) => onReprintCompany(event.target.value)} required>
                  <option value="">Select company</option>
                  {companies.map((company) => (
                    <option key={company.company_code} value={company.company_code}>
                      {company.company_code}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Department
                <select
                  value={reprintDepartment}
                  onChange={(event) => {
                    setReprintDepartment(event.target.value)
                    setReprints([])
                    setReprintsLoaded(false)
                    setReprintQuery('')
                    setReprintPage(0)
                    setSelectedReprintIds([])
                  }}
                  required
                  disabled={!reprintCompany}
                >
                  <option value="">Select department</option>
                  {reprintDepartments.map((row) => (
                    <option key={row.department} value={row.department}>
                      {row.department}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="primary rectangle" disabled={viewingReprints}>
                {viewingReprints ? 'Loading…' : 'View'}
              </button>
            </form>
            {error && (
              <div className="banner" role="alert">
                <p>{error}</p>
              </div>
            )}
            {notice && (
              <div className="banner success" role="status">
                <p>{notice}</p>
              </div>
            )}
            {reprintsLoaded && reprints.length === 0 && (
              <p className="empty">No printed passes for this department.</p>
            )}
            {reprintsLoaded && reprints.length > 0 && (
              <>
                <div className="pass-toolbar">
                  <label className="select-all">
                    <input
                      type="checkbox"
                      checked={allVisibleReprintsSelected}
                      onChange={toggleAllReprints}
                    />
                    Select all
                  </label>
                  <label className="search">
                    <span className="visually-hidden">Search name or employee id</span>
                    <input
                      value={reprintQuery}
                      onChange={(event) => {
                        setReprintQuery(event.target.value)
                        setReprintPage(0)
                      }}
                      placeholder="Search name or employee id"
                    />
                  </label>
                  <span className="count">{selectedReprintIds.length} selected</span>
                  {visibleReprints.length > 0 && (
                    <div className="pager">
                      <button
                        type="button"
                        onClick={() => setReprintPage((page) => Math.max(0, page - 1))}
                        disabled={currentReprintPage === 0}
                      >
                        Previous
                      </button>
                      <p>
                        {reprintRangeStart}–{reprintRangeEnd} of {visibleReprints.length}
                      </p>
                      <button
                        type="button"
                        onClick={() => setReprintPage((page) => Math.min(reprintPageCount - 1, page + 1))}
                        disabled={currentReprintPage >= reprintPageCount - 1}
                      >
                        Next
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    className="primary rectangle"
                    disabled={!selectedReprintIds.length || reprintingPasses}
                    onClick={onReprintPasses}
                  >
                    {reprintingPasses ? 'Preparing…' : 'Reprint'}
                  </button>
                </div>
                {visibleReprints.length === 0 ? (
                  <p className="empty">No printed passes match this search.</p>
                ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th></th>
                        <th>Event id</th>
                        <th>Employee code</th>
                        <th>Unregistered number</th>
                        <th>Staff name</th>
                        <th>Attendee</th>
                        <th>Relation</th>
                        <th>Print status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedReprints.map((row) => (
                        <tr key={row.unique_event_id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedReprintIds.includes(row.unique_event_id)}
                              onChange={() => toggleReprint(row.unique_event_id)}
                              aria-label={`Select ${row.name}`}
                            />
                          </td>
                          <td>{row.unique_event_id}</td>
                          <td>{row.employee_id || '—'}</td>
                          <td>{row.unregistered_number || '—'}</td>
                          <td>{row.employee_name}</td>
                          <td>{row.name}</td>
                          <td>{row.relation}</td>
                          <td>
                            <span className={`status status-${row.print_status.toLowerCase()}`}>
                              {row.print_status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                )}
              </>
            )}
          </section>
        )}

        {(view === 'gate' || view === 'meals') && (
          <section className="add-section gate-screen" id={view === 'meals' ? 'meals-gate' : 'entry-gate'}>
            <h2>{view === 'meals' ? 'Meals gate' : 'Entry gate'}</h2>
            <form className="gate-form" onSubmit={onGateEntry}>
              <button type="button" className="rectangle gate-scan" onClick={scanning ? stopCamera : () => startScan()}>
                {scanning ? 'Stop camera' : 'Scan with camera'}
              </button>
              <label>
                Joinee Pass
                <input
                  ref={passInputRef}
                  className="gate-pass"
                  value={joineePass}
                  onChange={onPassChange}
                  onPointerDown={focusPassWithoutKeyboard}
                  inputMode="none"
                  autoComplete="off"
                  placeholder="Joining id"
                  aria-busy={entering}
                />
              </label>
              {view === 'meals' && (
                <button
                  type="button"
                  className="rectangle gate-entry"
                  disabled={entering || !joineePass.trim()}
                  onClick={() => submitGate(joineePass, { resumeCamera: mealsFromCameraRef.current })}
                >
                  {entering ? 'Saving…' : 'Entry'}
                </button>
              )}
            </form>
            <video
              ref={videoRef}
              className={scanning ? 'gate-camera' : 'gate-camera is-hidden'}
              muted
              playsInline
            />
            {error && (
              <div className="banner" role="alert">
                <p>{error}</p>
                {cameraUrl && (
                  <p>
                    <a href={cameraUrl}>Open secure camera page</a>
                  </p>
                )}
              </div>
            )}
            <div
              className={
                (view === 'meals' ? gateResult?.already_served : gateResult?.already_joined)
                  ? 'gate-party is-repeat'
                  : 'gate-party'
              }
            >
              {(view === 'meals' ? gateResult?.already_served : gateResult?.already_joined) && (
                <p className="gate-alert" role="alert">
                  {view === 'meals'
                    ? 'Already scanned. This pass was already used at the meals gate.'
                    : 'Already scanned. This pass was already used at the entry gate.'}
                </p>
              )}
              <p className="gate-party-label">Last scanned party</p>
              <p className="gate-party-name">{gateResult ? gateResult.name : '—'}</p>
              {gateResult && (
                <p className="gate-party-status">
                  {view === 'meals'
                    ? gateResult.meals_status === 'Served'
                      ? gateResult.already_served
                        ? 'Already served'
                        : 'Served'
                      : gateResult.meals_status
                    : gateResult.join_status === 'Joined'
                      ? gateResult.already_joined
                        ? 'Already joined'
                        : 'Joined'
                      : gateResult.join_status}
                  {gateResult.report_issue ? ` · ${gateResult.report_issue}` : ''}
                </p>
              )}
            </div>
          </section>
        )}

        {view === 'summary' && (
          <section className="add-section summary-report" id="registration-summary">
            <div className="summary-toolbar">
              <h2>Registration Summary</h2>
              <div className="no-print summary-actions">
                <button type="button" className="primary" onClick={() => window.print()}>
                  Print
                </button>
                <button type="button" className="primary" onClick={onDownloadSummary} disabled={downloadingSummary}>
                  {downloadingSummary ? 'Downloading…' : 'Download'}
                </button>
                <button type="button" className="primary" onClick={onDownloadRegistrationList} disabled={downloadingList}>
                  {downloadingList ? 'Downloading…' : 'Registration List'}
                </button>
              </div>
            </div>
            {notice && (
              <div className="banner success no-print" role="status">
                <p>{notice}</p>
              </div>
            )}
            {error && (
              <div className="banner no-print" role="alert">
                <p>{error}</p>
              </div>
            )}
            {!summary ? (
              <p className="empty">{error ? 'Could not load the summary.' : 'Loading summary…'}</p>
            ) : (
              <>
                <div className="dashboard">
                  <article className="stat">
                    <span>Total employee strength</span>
                    <strong>{summary.total_employee_strength}</strong>
                  </article>
                  <article className="stat">
                    <span>Children under 5 years</span>
                    <strong>{summary.children_under_five}</strong>
                  </article>
                  <article className="stat">
                    <span>Total registrations</span>
                    <strong>{summary.total_registrations}</strong>
                  </article>
                  <article className="stat">
                    <span>Entry gate scanned</span>
                    <strong>{summary.entry_gate_count}</strong>
                  </article>
                  <article className="stat">
                    <span>Meals gate scanned</span>
                    <strong>{summary.meals_gate_count}</strong>
                  </article>
                </div>

                <h3>Employee strength by company</h3>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Company</th>
                        <th>Company name</th>
                        <th>Employees</th>
                        <th>Strength</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.strength_by_company.map((row) => (
                        <tr key={row.company_code}>
                          <td>{row.company_code}</td>
                          <td>{row.company_name}</td>
                          <td>{row.employees}</td>
                          <td>{row.strength}</td>
                        </tr>
                      ))}
                      <tr>
                        <td colSpan={2}>Total</td>
                        <td>{summary.total_employees}</td>
                        <td>{summary.total_employee_strength}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <h3>Registered employees by company</h3>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Company</th>
                        <th>Company name</th>
                        <th>Registered employees</th>
                        <th>Unregistered employees</th>
                        <th>Family members</th>
                        <th>Total Employees and Family</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.registered_employees_by_company.map((row) => (
                        <tr key={row.company_code}>
                          <td>{row.company_code}</td>
                          <td>{row.company_name}</td>
                          <td>{row.registered_employees}</td>
                          <td>{row.unregistered_employees}</td>
                          <td>{row.family_members}</td>
                          <td>{row.total_employees_and_family}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <PagedSummarySection
                  title="Registered employees"
                  rows={summary.registered_employees}
                  empty="No registered employees yet."
                />

                <PagedSummarySection
                  title="Unregistered employees"
                  rows={summary.unregistered_employees}
                  empty="No unregistered employees yet."
                />

                <PagedSummarySection
                  title="Family member list"
                  rows={summary.family_members}
                  empty="No family members registered yet."
                />

                <h3>Category wise registration</h3>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th>Registrations</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.categories.map((row) => (
                        <tr key={row.category}>
                          <td>{row.category}</td>
                          <td>{row.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <PagedSummarySection
                  title="Entry gate scanned"
                  rows={summary.entry_gate}
                  empty="No entry gate scans yet."
                  countLabel={`${summary.entry_gate_count} scanned`}
                />

                <PagedSummarySection
                  title="Meals gate scanned"
                  rows={summary.meals_gate}
                  empty="No meals gate scans yet."
                  countLabel={`${summary.meals_gate_count} scanned`}
                />

                <div className="summary-section-head">
                  <h3>Complete details</h3>
                  {summary.registrations.length > 0 && (
                    <div className="pager no-print">
                      <button
                        type="button"
                        onClick={() => setSummaryPage((page) => Math.max(0, page - 1))}
                        disabled={currentSummaryPage === 0}
                      >
                        Previous
                      </button>
                      <p>
                        {summaryRangeStart}–{summaryRangeEnd} of {summary.registrations.length}
                      </p>
                      <button
                        type="button"
                        onClick={() => setSummaryPage((page) => Math.min(summaryPageCount - 1, page + 1))}
                        disabled={currentSummaryPage >= summaryPageCount - 1}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>
                <SummaryPassTable rows={summaryPageRows} empty="No registrations yet." />
              </>
            )}
          </section>
        )}

        {view === 'report' && (
          <section className="add-section" id="final-report">
            <h2>Final report</h2>
            {error && (
              <div className="banner" role="alert">
                <p>{error}</p>
              </div>
            )}
            {!report ? (
              <p className="empty">{error ? 'Could not load the report.' : 'Loading report…'}</p>
            ) : (
              <>
                <div className="dashboard">
                  <article className="stat">
                    <span>Total registered</span>
                    <strong>{report.summary.registered}</strong>
                  </article>
                  <article className="stat">
                    <span>Entry gate</span>
                    <strong>{report.summary.entry_gate}</strong>
                  </article>
                  <article className="stat">
                    <span>Meals gate</span>
                    <strong>{report.summary.meals_gate}</strong>
                  </article>
                  <article className="stat">
                    <span>Approved</span>
                    <strong>{report.summary.approved}</strong>
                  </article>
                  <article className="stat">
                    <span>Pending approval</span>
                    <strong>{report.summary.pending_approval}</strong>
                  </article>
                  <article className="stat">
                    <span>Rejected</span>
                    <strong>{report.summary.rejected}</strong>
                  </article>
                  <article className="stat">
                    <span>Printed</span>
                    <strong>{report.summary.printed}</strong>
                  </article>
                  <article className="stat">
                    <span>Drunk issue</span>
                    <strong>{report.summary.drunk_issue}</strong>
                  </article>
                  <article className="stat">
                    <span>Other issues</span>
                    <strong>{report.summary.other_issues}</strong>
                  </article>
                </div>
                {report.rows.length === 0 ? (
                  <p className="empty">No join event entries yet.</p>
                ) : (
                  <>
                    <div className="pass-toolbar">
                      <div className="pager">
                        <button
                          type="button"
                          onClick={() => setReportPage((page) => Math.max(0, page - 1))}
                          disabled={currentReportPage === 0}
                        >
                          Previous
                        </button>
                        <p>
                          {reportRangeStart}–{reportRangeEnd} of {report.rows.length}
                        </p>
                        <button
                          type="button"
                          onClick={() => setReportPage((page) => Math.min(reportPageCount - 1, page + 1))}
                          disabled={currentReportPage >= reportPageCount - 1}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Event id</th>
                            <th>Employee code</th>
                            <th>Unregistered number</th>
                            <th>Staff</th>
                            <th>Attendee</th>
                            <th>Relation</th>
                            <th>Company</th>
                            <th>Department</th>
                            <th>Approve</th>
                            <th>Print</th>
                            <th>Entry</th>
                            <th>Meals</th>
                            <th>Issue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedReportRows.map((row) => (
                          <tr key={row.unique_event_id}>
                            <td>{row.unique_event_id}</td>
                            <td>{row.employee_id || '—'}</td>
                            <td>{row.unregistered_number || '—'}</td>
                            <td>{row.employee_name}</td>
                            <td>{row.name}</td>
                            <td>{row.relation}</td>
                            <td>{row.company_code}</td>
                            <td>{row.department}</td>
                            <td>
                              <span className={`status status-${row.approve_status.toLowerCase()}`}>
                                {row.approve_status}
                              </span>
                            </td>
                            <td>
                              <span className={`status status-${row.print_status.toLowerCase()}`}>
                                {row.print_status}
                              </span>
                            </td>
                            <td>
                              <span className={`status status-${row.join_status.toLowerCase()}`}>
                                {row.join_status}
                              </span>
                            </td>
                            <td>
                              <span className={`status status-${row.meals_status.toLowerCase()}`}>
                                {row.meals_status}
                              </span>
                            </td>
                            <td>{row.report_issue || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  </>
                )}
              </>
            )}
          </section>
        )}

        {view === 'admin' && (
          <section className="add-section" id="admin">
            <h2>Admin</h2>
            {!adminUnlocked ? (
              <>
                <form className="upload-form" onSubmit={onUnlockAdmin}>
                  <label>
                    Passkey
                    <input
                      type="password"
                      value={adminKey}
                      onChange={(event) => setAdminKey(event.target.value)}
                      autoComplete="off"
                      required
                    />
                  </label>
                  <button type="submit" className="primary">
                    Enter
                  </button>
                </form>
                {error && (
                  <div className="banner" role="alert">
                    <p>{error}</p>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="join-data">
                  <h3>User master</h3>
                  <p className="hint-text">
                    These user names and passwords sign in to the application. The signed-in user cannot be deleted, and at least one user must remain.
                  </p>
                  <form className="user-fields" onSubmit={onAddUser}>
                    <label className="kids-field">
                      User name
                      <input
                        value={userName}
                        onChange={(event) => setUserName(event.target.value)}
                        maxLength={50}
                        required
                        autoComplete="off"
                      />
                    </label>
                    <label className="kids-field">
                      Password
                      <input
                        value={userPassword}
                        onChange={(event) => setUserPassword(event.target.value)}
                        maxLength={50}
                        required
                        autoComplete="off"
                      />
                    </label>
                    <button type="submit" className="primary rectangle" disabled={saving}>
                      {saving ? 'Saving…' : 'Add'}
                    </button>
                  </form>
                  {userRows.length === 0 ? (
                    <p className="empty">No users yet.</p>
                  ) : (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>User name</th>
                            <th>Password</th>
                          </tr>
                        </thead>
                        <tbody>
                          {userRows.map((row) => (
                            <tr key={row.username}>
                              <td>{row.username}</td>
                              <td>
                                <div className="password-edit">
                                  <input
                                    value={userPasswords[row.username] ?? ''}
                                    maxLength={50}
                                    aria-label={`Password for ${row.username}`}
                                    autoComplete="off"
                                    onChange={(event) =>
                                      setUserPasswords((current) => ({
                                        ...current,
                                        [row.username]: event.target.value,
                                      }))
                                    }
                                  />
                                  <button
                                    type="button"
                                    className="primary rectangle"
                                    disabled={updatingUser === row.username}
                                    onClick={() => onUpdateUserPassword(row)}
                                  >
                                    {updatingUser === row.username ? 'Saving…' : 'Update'}
                                  </button>
                                  <button
                                    type="button"
                                    className="member-remove"
                                    disabled={
                                      deletingUser === row.username ||
                                      row.username.toLowerCase() === sessionUser.toLowerCase()
                                    }
                                    title={
                                      row.username.toLowerCase() === sessionUser.toLowerCase()
                                        ? 'The signed-in user cannot be deleted'
                                        : `Delete ${row.username}`
                                    }
                                    onClick={() => onDeleteUser(row)}
                                  >
                                    {deletingUser === row.username ? 'Deleting…' : 'Delete'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div className="join-data">
                  <h3>JoinEvents</h3>
                  <p className="hint-text">
                    Download every row, or upload an Excel file with the same columns.
                    A blank UniqueEventId inserts a new row. An existing UniqueEventId updates that row.
                    Delete JoinEvents removes every row in JoinEvents and JoinChild, including printed passes.
                  </p>
                  <div className="join-data-actions">
                    <button
                      type="button"
                      className="primary rectangle"
                      onClick={onDownloadJoinEvents}
                      disabled={downloadingJoins}
                    >
                      {downloadingJoins ? 'Downloading…' : 'Download'}
                    </button>
                    <form className="upload-form" onSubmit={onUploadJoinEvents}>
                      <label>
                        Excel file
                        <input
                          type="file"
                          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                          onChange={(event) => setJoinFile(event.target.files?.[0] || null)}
                        />
                      </label>
                      <button type="submit" className="primary rectangle" disabled={!joinFile || uploadingJoins}>
                        {uploadingJoins ? 'Uploading…' : 'Upload'}
                      </button>
                    </form>
                  </div>
                  <div className="join-data-actions">
                    <button
                      type="button"
                      className="complete-delete rectangle"
                      onClick={onDeleteAllJoinEvents}
                      disabled={deletingJoins}
                    >
                      {deletingJoins ? 'Deleting…' : 'Delete JoinEvents'}
                    </button>
                  </div>
                </div>
                <div className="join-data">
                  <h3>Categories</h3>
                  <p className="hint-text">
                    Reset every category PrefixNumber to zero. The next bulk pass for each category starts at 1.
                  </p>
                  <div className="join-data-actions">
                    <button
                      type="button"
                      className="complete-delete rectangle"
                      onClick={onResetCategoryPrefixes}
                      disabled={resettingPrefixes}
                    >
                      {resettingPrefixes ? 'Resetting…' : 'Reset PrefixNumber'}
                    </button>
                  </div>
                </div>
                <div className="join-data">
                  <h3>Employees</h3>
                  <p className="hint-text">
                    Delete every employee and the join-event records linked to them.
                  </p>
                  <div className="join-data-actions">
                    <button
                      type="button"
                      className="complete-delete rectangle"
                      onClick={onDeleteAllEmployees}
                      disabled={deletingEmployees}
                    >
                      {deletingEmployees ? 'Deleting…' : 'Complete delete'}
                    </button>
                  </div>
                </div>
                {error && (
                  <div className="banner" role="alert">
                    <p>{error}</p>
                  </div>
                )}
                {notice && (
                  <div className="banner success" role="status">
                    <p>{notice}</p>
                  </div>
                )}
                <DeletionLogTable
                  rows={deletionLogs}
                  page={deletionPage}
                  onPage={setDeletionPage}
                />
              </>
            )}
          </section>
        )}
      </main>
    </div>
  )
}
