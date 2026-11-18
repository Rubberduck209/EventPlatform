const IDENTITY_BASE_URL = 'http://localhost:8001/api/v1';
const EVENT_BASE_URL = 'http://localhost:8002/api/v1';
const PAYMENT_BASE_URL = 'http://localhost:8004/api/v1';

export const getStoredToken = () => localStorage.getItem('token');
export const setStoredToken = (token) => localStorage.setItem('token', token);
export const removeStoredToken = () => localStorage.removeItem('token');

export const getStoredUser = () => {
  const user = localStorage.getItem('user');
  return user ? JSON.parse(user) : null;
};
export const setStoredUser = (user) => localStorage.setItem('user', JSON.stringify(user));
export const removeStoredUser = () => localStorage.removeItem('user');

async function requestUrl(baseUrl, endpoint, options = {}) {
  const token = getStoredToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg = data?.detail || 'Đã có lỗi xảy ra. Vui lòng thử lại.';
    throw new Error(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
  }

  return data;
}

const requestIdentity = (endpoint, options = {}) => requestUrl(IDENTITY_BASE_URL, endpoint, options);
const requestEvent = (endpoint, options = {}) => requestUrl(EVENT_BASE_URL, endpoint, options);
const requestPayment = (endpoint, options = {}) => requestUrl(PAYMENT_BASE_URL, endpoint, options);

export const api = {
  // Auth (Identity Service - Port 8001)
  register: (payload) => requestIdentity('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload) => requestIdentity('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  googleLogin: (id_token) => requestIdentity('/auth/google', { method: 'POST', body: JSON.stringify({ id_token }) }),
  getMe: () => requestIdentity('/auth/me'),
  refreshToken: () => requestIdentity('/auth/refresh', { method: 'POST' }),

  // Organizer (Identity Service - Port 8001)
  applyOrganizer: (payload) => requestIdentity('/organizers/apply', { method: 'POST', body: JSON.stringify(payload) }),
  getMyOrganizerProfile: () => requestIdentity('/organizers/my-profile'),

  // Admin (Identity Service - Port 8001)
  getPendingOrganizers: () => requestIdentity('/admin/organizers/pending'),
  reviewOrganizer: (userId, status) => requestIdentity(`/admin/organizers/${userId}/approve`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  }),

  // Staff Management (Identity Service - Port 8001)
  createStaff: (payload) => requestIdentity('/organizers/staff', { method: 'POST', body: JSON.stringify(payload) }),
  getMyManagedStaff: () => requestIdentity('/organizers/staff'),
  deleteStaff: (staffId) => requestIdentity(`/organizers/staff/${staffId}`, { method: 'DELETE' }),
  assignStaff: (payload) => requestIdentity('/staff/assign', { method: 'POST', body: JSON.stringify(payload) }),
  getEventStaff: (eventId) => requestIdentity(`/staff/events/${eventId}`),
  unassignEventStaff: (eventId, staffUserId) => requestIdentity(`/staff/events/${eventId}/${staffUserId}`, { method: 'DELETE' }),
  getMyStaffAssignments: () => requestIdentity('/staff/my-assignments'),

  // Event Service (Port 8002)
  getCategories: () => requestEvent('/categories'),
  createCategory: (payload) => requestEvent('/categories', { method: 'POST', body: JSON.stringify(payload) }),
  getPublicEvents: (params = '') => requestEvent(`/events/public${params}`),
  getMyEvents: () => requestEvent('/events/my-events'),
  getEventDetail: (eventId) => requestEvent(`/events/${eventId}`),
  createEvent: (payload) => requestEvent('/events', { method: 'POST', body: JSON.stringify(payload) }),
  updateEvent: (eventId, payload) => requestEvent(`/events/${eventId}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteEvent: (eventId) => requestEvent(`/events/${eventId}`, { method: 'DELETE' }),
  updateEventStatus: (eventId, status, reason = undefined) => requestEvent(`/events/${eventId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, reason })
  }),
  requestEventCancelOtp: (eventId) => requestEvent(`/events/${eventId}/request-cancel-otp`, {
    method: 'POST'
  }),
  cancelEventVerified: (eventId, payload) => requestEvent(`/events/${eventId}/cancel-verified`, {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  createZone: (eventId, payload) => requestEvent(`/events/${eventId}/zones`, {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  deleteZone: (zoneId) => requestEvent(`/zones/${zoneId}`, { method: 'DELETE' }),
  getSeatMap: (eventId) => requestEvent(`/events/${eventId}/seatmap`),
  batchUpdateZoneSeats: (zoneId, seats) => requestEvent(`/zones/${zoneId}/seats/batch-update`, {
    method: 'PUT',
    body: JSON.stringify({ seats })
  }),
  createTicketType: (eventId, payload) => requestEvent(`/events/${eventId}/ticket-types`, {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  deleteTicketType: (ticketTypeId) => requestEvent(`/ticket-types/${ticketTypeId}`, { method: 'DELETE' }),
  addPricingRule: (ticketTypeId, payload) => requestEvent(`/ticket-types/${ticketTypeId}/pricing-rules`, {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  validatePurchase: (eventId, payload) => requestEvent(`/events/${eventId}/validate-purchase`, {
    method: 'POST',
    body: JSON.stringify(payload)
  }),

  // Payment Service (Port 8004 - VNPay Sandbox, IPN Webhook & Refunds)
  createPayment: (payload) => requestPayment('/payments/create', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  getMyPayments: () => requestPayment('/payments/my-payments'),
  simulateVNPayIPN: (payload) => requestPayment('/payments/simulate-vnpay-ipn', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  refundPayment: (paymentId, payload) => requestPayment(`/payments/${paymentId}/refund`, {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  refundPaymentsByEvent: (eventId, reason) => requestPayment(`/payments/refund-by-event/${eventId}`, {
    method: 'POST',
    body: JSON.stringify({ reason })
  }),
};
