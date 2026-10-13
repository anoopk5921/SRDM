function errorMessage(data, fallback) {
  if (!data) return fallback
  if (typeof data.detail === 'string') return data.detail
  if (Array.isArray(data.detail) && data.detail[0]?.msg) return data.detail[0].msg
  return fallback
}

async function request(path, options = {}) {
  let response
  try {
    response = await fetch(path, {
      credentials: 'include',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    })
  } catch {
    throw new Error('Cannot reach the API. Start it with uvicorn on port 8000.')
  }

  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) {
    if (!options.quietAuth && response.status === 401 && data?.detail === 'Sign in required') {
      window.dispatchEvent(new CustomEvent('srdm-sign-out'))
    }
    throw new Error(errorMessage(data, 'Request failed'))
  }
  return data
}

export function fetchHealth() {
  return request('/api/health')
}

export function loginApp(username, password) {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export function fetchSession() {
  return request('/api/auth/session', { quietAuth: true })
}

export function unlockAdmin(passkey) {
  return request('/api/auth/admin', {
    method: 'POST',
    body: JSON.stringify({ passkey }),
  })
}

export function lockAdmin() {
  return request('/api/auth/admin/lock', { method: 'POST', body: '{}' })
}

export function logoutApp() {
  return request('/api/auth/logout', { method: 'POST', body: '{}' })
}

export function fetchUsers() {
  return request('/api/users')
}

export function createUser(payload) {
  return request('/api/users', { method: 'POST', body: JSON.stringify(payload) })
}

export function updateUserPassword(payload) {
  return request('/api/users/password', { method: 'PUT', body: JSON.stringify(payload) })
}

export function deleteUser(username) {
  return request(`/api/users/${encodeURIComponent(username)}`, { method: 'DELETE' })
}

export function fetchCompanies() {
  return request('/api/companies')
}

export function createCompany(payload) {
  return request('/api/companies', { method: 'POST', body: JSON.stringify(payload) })
}

export function updateCompany(companyCode, payload) {
  return request(`/api/companies/${encodeURIComponent(companyCode)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function fetchEmployees() {
  return request('/api/employees')
}

export function deleteAllEmployees() {
  return request('/api/employees', { method: 'DELETE' })
}

export function updateEmployeeStrength(payload) {
  return request('/api/employees/strength', { method: 'PUT', body: JSON.stringify(payload) })
}

export function fetchEmployee(employeeId) {
  return request(`/api/employees/${encodeURIComponent(employeeId)}`)
}

export function fetchJoinEvents(employeeId) {
  return request(`/api/join-events?employee_id=${encodeURIComponent(employeeId)}`)
}

export function fetchJoinChild(employeeId) {
  return request(`/api/join-events/child?employee_id=${encodeURIComponent(employeeId)}`)
}

export function saveJoinEvent(payload) {
  return request('/api/join-events', { method: 'POST', body: JSON.stringify(payload) })
}

export function saveUnregisteredJoin(payload) {
  return request('/api/join-events/unregistered', { method: 'POST', body: JSON.stringify(payload) })
}

export function fetchUnregisteredHousehold(number) {
  return request(`/api/join-events/unregistered?number=${encodeURIComponent(number)}`)
}

export function saveUnregisteredFamily(payload) {
  return request('/api/join-events/unregistered/family', { method: 'POST', body: JSON.stringify(payload) })
}

export function fetchCategories() {
  return request('/api/categories')
}

export function resetCategoryPrefixes() {
  return request('/api/categories/reset-prefix', { method: 'POST', body: '{}' })
}

export function saveBulkRegistration(payload) {
  return request('/api/categories/bulk', { method: 'POST', body: JSON.stringify(payload) })
}

export function deleteJoinEvent(eventId) {
  return request(`/api/join-events/${eventId}`, { method: 'DELETE' })
}

export function fetchDeletionLogs() {
  return request('/api/deletion-logs')
}

export function fetchDepartmentMaster() {
  return request('/api/departments')
}

export function createDepartment(payload) {
  return request('/api/departments', { method: 'POST', body: JSON.stringify(payload) })
}

export function updateDepartmentPassword(payload) {
  return request('/api/departments/password', { method: 'PUT', body: JSON.stringify(payload) })
}

export function fetchDepartments(companyCode) {
  return request(`/api/attendees/departments?company_code=${encodeURIComponent(companyCode)}`)
}

export function fetchPendingApprovalDepartments(companyCode) {
  return request(`/api/attendees/pending-departments?company_code=${encodeURIComponent(companyCode)}`)
}

export function fetchAllDepartments() {
  return request('/api/attendees/departments')
}

export function loginAttendees(payload) {
  return request('/api/attendees/login', { method: 'POST', body: JSON.stringify(payload) })
}

export function fetchAttendees(payload) {
  return request('/api/attendees/list', { method: 'POST', body: JSON.stringify(payload) })
}

export function decideAttendee(eventId, payload) {
  return request(`/api/attendees/${eventId}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export function approveAllAttendees(payload) {
  return request('/api/attendees/approve-all', { method: 'POST', body: JSON.stringify(payload) })
}

export function rejectAllAttendees(payload) {
  return request('/api/attendees/reject-all', { method: 'POST', body: JSON.stringify(payload) })
}

export function fetchJoinEventReport() {
  return request('/api/reports/join-events')
}

export function fetchRegistrationSummary() {
  return request('/api/reports/registration-summary')
}

export async function downloadRegistrationList() {
  let response
  try {
    response = await fetch('/api/reports/registration-list.pdf')
  } catch {
    throw new Error('Cannot reach the API. Start it with uvicorn on port 8000.')
  }
  const contentType = response.headers.get('content-type') || ''
  if (!response.ok || !contentType.includes('pdf')) {
    const text = await response.text()
    const data = text ? JSON.parse(text) : null
    throw new Error(errorMessage(data, 'Could not download the registration list'))
  }
  return response.blob()
}

export async function downloadRegistrationSummary() {
  let response
  try {
    response = await fetch('/api/reports/registration-summary.pdf')
  } catch {
    throw new Error('Cannot reach the API. Start it with uvicorn on port 8000.')
  }
  const contentType = response.headers.get('content-type') || ''
  if (!response.ok || !contentType.includes('pdf')) {
    const text = await response.text()
    const data = text ? JSON.parse(text) : null
    throw new Error(errorMessage(data, 'Could not download the registration summary'))
  }
  return response.blob()
}

export function fetchPendingPrintDepartments(companyCode) {
  const params = new URLSearchParams()
  if (companyCode) params.set('company_code', companyCode)
  const query = params.toString()
  return request(`/api/passes/pending-departments${query ? `?${query}` : ''}`)
}

export function fetchApprovedPasses(companyCode, department) {
  const params = new URLSearchParams({ company_code: companyCode, department })
  return request(`/api/passes?${params}`)
}

export function fetchAllDepartmentPasses(companyCode) {
  const params = new URLSearchParams()
  if (companyCode) params.set('company_code', companyCode)
  const query = params.toString()
  return request(`/api/passes/all-departments${query ? `?${query}` : ''}`)
}

export function fetchPrintedPasses(companyCode, department) {
  const params = new URLSearchParams({ company_code: companyCode, department })
  return request(`/api/passes/reprints?${params}`)
}

export function recordGateEntry(joiningId) {
  return request('/api/gate/entry', {
    method: 'POST',
    body: JSON.stringify({ joining_id: joiningId }),
  })
}

export function recordMealsEntry(joiningId) {
  return request('/api/gate/meals', {
    method: 'POST',
    body: JSON.stringify({ joining_id: joiningId }),
  })
}

export function reportGateIssue(joiningId, reportIssue) {
  return request('/api/gate/issue', {
    method: 'POST',
    body: JSON.stringify({ joining_id: joiningId, report_issue: reportIssue }),
  })
}

export async function downloadPassesPdf(payload, path = '/api/passes/pdf') {
  let response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    throw new Error('Cannot reach the API. Start it with uvicorn on port 8000.')
  }
  const contentType = response.headers.get('content-type') || ''
  if (!response.ok || !contentType.includes('pdf')) {
    const text = await response.text()
    const data = text ? JSON.parse(text) : null
    throw new Error(errorMessage(data, 'Could not generate the pass PDF'))
  }
  return response.blob()
}

export function downloadReprintPdf(payload) {
  return downloadPassesPdf(payload, '/api/passes/reprint-pdf')
}

export function downloadAllDepartmentPassesPdf(payload) {
  return downloadPassesPdf(payload, '/api/passes/all-departments/pdf')
}

export async function downloadJoinEvents() {
  let response
  try {
    response = await fetch('/api/passes/join-events', { credentials: 'include' })
  } catch {
    throw new Error('Cannot reach the API. Start it with uvicorn on port 8000.')
  }
  const contentType = response.headers.get('content-type') || ''
  if (!response.ok || !contentType.includes('spreadsheet')) {
    const text = await response.text()
    const data = text ? JSON.parse(text) : null
    throw new Error(errorMessage(data, 'Could not download JoinEvents'))
  }
  return response.blob()
}

export async function uploadJoinEvents(file) {
  const body = new FormData()
  body.append('file', file)
  let response
  try {
    response = await fetch('/api/passes/join-events', { method: 'POST', body, credentials: 'include' })
  } catch {
    throw new Error('Cannot reach the API. Start it with uvicorn on port 8000.')
  }
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) {
    throw new Error(errorMessage(data, 'Upload failed'))
  }
  return data
}

export function deleteAllJoinEvents() {
  return request('/api/passes/join-events', { method: 'DELETE' })
}

export async function uploadEmployees(file) {
  const body = new FormData()
  body.append('file', file)
  let response
  try {
    response = await fetch('/api/employees/upload', { method: 'POST', body })
  } catch {
    throw new Error('Cannot reach the API. Start it with uvicorn on port 8000.')
  }
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) {
    throw new Error(errorMessage(data, 'Upload failed'))
  }
  return data
}
