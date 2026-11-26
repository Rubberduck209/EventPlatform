import React, { useState, useEffect } from 'react';
import { api } from '../api';
import ToastNotification from './ToastNotification';

const cleanName = (val) => (val ? String(val).replace(/\s*\([^)]*\)/g, '').trim() : '');

export default function StaffView({ user, onLogout }) {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState(null);

  const [ticketCodeInput, setTicketCodeInput] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [checkinHistory, setCheckinHistory] = useState([]);

  const [attendeeSearch, setAttendeeSearch] = useState('');
  const [attendees, setAttendees] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);

  const fetchEventTickets = async (evId) => {
    if (!evId) return;
    setTicketsLoading(true);
    try {
      const list = await api.getEventTickets(String(evId));
      setAttendees(list || []);
    } catch (err) {
      console.error(err);
    } finally {
      setTicketsLoading(false);
    }
  };

  const fetchAssignments = async () => {
    setLoading(true);
    try {
      const data = await api.getMyStaffAssignments();
      setAssignments(data);
      if (data && data.length > 0 && !selectedEventId) {
        setSelectedEventId(data[0].event_id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignments();
  }, [user]);

  useEffect(() => {
    if (selectedEventId) {
      fetchEventTickets(selectedEventId);
    }
  }, [selectedEventId]);

  const currentAssignment = assignments.find((a) => a.event_id === selectedEventId) || assignments[0];
  const hasCheckinPermission = currentAssignment?.permissions?.includes('CHECKIN');
  const hasViewPermission = currentAssignment?.permissions?.includes('VIEW_ATTENDEES');

  const handleCheckin = async (e) => {
    e.preventDefault();
    const rawInput = ticketCodeInput.trim();
    if (!rawInput || !selectedEventId) return;

    try {
      let qrTextToSend = rawInput;
      // Nếu nhân viên nhập mã vé ngắn (VD: TK-XXXX) không chứa dấu chấm chữ ký, hỗ trợ tra cứu chuỗi QR tương ứng
      if (!rawInput.includes('.') && rawInput.toUpperCase().startsWith('TK-')) {
        const detail = await api.getTicketDetail(rawInput.toUpperCase()).catch(() => null);
        if (detail && detail.qr_text) {
          qrTextToSend = detail.qr_text;
        }
      }

      const res = await api.checkinTicket({
        qr_text: qrTextToSend,
        event_id: String(selectedEventId),
        staff_id: String(user.id),
      });

      const nowTime = res.checked_in_at
        ? new Date(res.checked_in_at).toLocaleTimeString('vi-VN')
        : new Date().toLocaleTimeString('vi-VN');

      const newEntry = {
        ticketCode: res.ticket_code,
        attendee: res.owner_name || 'Khách tham dự',
        seat: res.seat_id ? `Ghế ${res.seat_id}` : `Vé đứng (Hạng #${res.ticket_type_id})`,
        time: nowTime,
      };

      setCheckinHistory((prev) => [newEntry, ...prev]);
      setScanResult({
        text: `✓ ${res.message} Mã vé [${res.ticket_code}] — ${newEntry.attendee} — ${newEntry.seat}.`,
        type: 'success',
      });
      setTicketCodeInput('');
      await fetchEventTickets(selectedEventId);
    } catch (err) {
      let errMsg = err.message || 'Check-in thất bại!';
      try {
        const parsed = JSON.parse(errMsg);
        if (parsed && parsed.message) {
          errMsg = `[${parsed.result || 'ERROR'}] ${parsed.message}`;
        }
      } catch (_) {
        // giữ nguyên chuỗi lỗi
      }
      setScanResult({
        text: errMsg,
        type: 'error',
      });
      await fetchEventTickets(selectedEventId);
    }
  };

  const filteredAttendees = attendees.filter((a) =>
    (a.owner_name || '').toLowerCase().includes(attendeeSearch.toLowerCase()) ||
    (a.ticket_code || '').toLowerCase().includes(attendeeSearch.toLowerCase()) ||
    (a.seat_id || '').toLowerCase().includes(attendeeSearch.toLowerCase())
  );

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <div className="layout-staff">
        <div className="staff-topbar">
          <div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600 }}>
              EVENTHUB GATE CHECK-IN TERMINAL
            </div>
            <h1 style={{ fontSize: '1.2rem', fontWeight: 700 }}>
              Hệ Thống Soát Vé Sự Kiện — {cleanName(user.full_name)}
            </h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {assignments.length > 0 && (
              <select
                className="form-input"
                style={{ width: 'auto', padding: '0.45rem 0.75rem', fontSize: '0.84rem' }}
                value={selectedEventId || ''}
                onChange={(e) => {
                  setSelectedEventId(Number(e.target.value));
                  setScanResult(null);
                }}
              >
                {assignments.map((a) => (
                  <option key={a.id} value={a.event_id}>
                    Sự kiện #{a.event_id}: {a.event_title} — {cleanName(a.staff_role_title)}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                fetchAssignments();
                if (selectedEventId) fetchEventTickets(selectedEventId);
              }}
              style={{ padding: '0.45rem 0.85rem' }}
            >
              Làm mới
            </button>
            <button type="button" className="btn btn-outline" onClick={onLogout} style={{ padding: '0.45rem 0.85rem' }}>
              Đăng xuất
            </button>
          </div>
        </div>

        {loading ? (
          <div className="card" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
            Đang tải thông tin ca trực...
          </div>
        ) : assignments.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '2.5rem' }}>
            <h3 style={{ fontSize: '1.05rem', marginBottom: '0.4rem' }}>Chưa có sự kiện nào được phân công</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem' }}>
              Tài khoản của bạn hiện chưa được Ban tổ chức phân công vào sự kiện nào.
            </p>
          </div>
        ) : (
          currentAssignment && (
            <div className="staff-split">
              <div className="card" style={{ marginBottom: 0 }}>
                <div className="card-header">
                  <div>
                    <div className="card-title">Quét mã vé Check-in</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Vị trí: <strong>{cleanName(currentAssignment.staff_role_title)}</strong>
                    </div>
                  </div>
                  <span className={`badge ${hasCheckinPermission ? 'badge-APPROVED' : 'badge-REJECTED'}`}>
                    {hasCheckinPermission ? 'CHECKIN' : 'Bị khóa'}
                  </span>
                </div>

                {hasCheckinPermission ? (
                  <>
                    <form onSubmit={handleCheckin} style={{ marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input
                          type="text"
                          required
                          className="form-input mono"
                          placeholder="Dán chuỗi QR ký số hoặc nhập mã vé (VD: TK-...)..."
                          value={ticketCodeInput}
                          onChange={(e) => setTicketCodeInput(e.target.value)}
                        />
                        <button type="submit" className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>
                          Xác thực vé
                        </button>
                      </div>
                    </form>

                    <ToastNotification msg={scanResult} onClose={() => setScanResult(null)} />

                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                      LỊCH SỬ SOÁT VÉ TRONG CA
                    </div>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Mã vé</th>
                          <th>Khách tham dự</th>
                          <th>Thời gian</th>
                        </tr>
                      </thead>
                      <tbody>
                        {checkinHistory.length === 0 ? (
                          <tr>
                            <td colSpan="3" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.25rem' }}>
                              Chưa có lượt quét vé nào trong phiên này.
                            </td>
                          </tr>
                        ) : (
                          checkinHistory.map((item, idx) => (
                            <tr key={idx}>
                              <td className="mono"><strong>{item.ticketCode}</strong></td>
                              <td>{item.attendee} — {item.seat}</td>
                              <td style={{ color: 'var(--success)', fontWeight: 600 }}>{item.time}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </>
                ) : (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-page)', borderRadius: 8 }}>
                    Tài khoản không được cấp quyền soát vé tại sự kiện này.
                  </div>
                )}
              </div>

              <div className="card" style={{ marginBottom: 0 }}>
                <div className="card-header">
                  <span className="card-title">Danh sách Khách tham dự</span>
                  <span className={`badge ${hasViewPermission ? 'badge-APPROVED' : 'badge-REJECTED'}`}>
                    {hasViewPermission ? 'VIEW_ATTENDEES' : 'Bị khóa'}
                  </span>
                </div>

                {hasViewPermission ? (
                  <>
                    <div className="form-group">
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Tra cứu tên khách, email hoặc mã vé..."
                        value={attendeeSearch}
                        onChange={(e) => setAttendeeSearch(e.target.value)}
                      />
                    </div>

                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Chủ sở hữu</th>
                          <th>Mã vé</th>
                          <th>Vị trí</th>
                          <th>Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ticketsLoading ? (
                          <tr>
                            <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>
                              Đang tải danh sách vé từ Ticket Service...
                            </td>
                          </tr>
                        ) : filteredAttendees.length === 0 ? (
                          <tr>
                            <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>
                              Chưa có vé nào được phát hành cho sự kiện này.
                            </td>
                          </tr>
                        ) : (
                          filteredAttendees.map((a) => {
                            const isCheckedIn = a.status === 'CHECKED_IN';
                            const isCancelled = a.status === 'CANCELLED';
                            const checkinTime = a.checked_in_at
                              ? new Date(a.checked_in_at).toLocaleTimeString('vi-VN')
                              : '';
                            return (
                              <tr key={a.ticket_code}>
                                <td>
                                  <strong>{a.owner_name}</strong>
                                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                    User #{a.owner_user_id} • Đơn #{a.booking_id} • QR v{a.qr_version}
                                  </div>
                                </td>
                                <td className="mono" style={{ fontSize: '0.8rem' }}>{a.ticket_code}</td>
                                <td>{a.seat_id ? `Ghế ${a.seat_id}` : `Vé đứng (Hạng #${a.ticket_type_id})`}</td>
                                <td>
                                  {isCheckedIn ? (
                                    <span className="badge badge-APPROVED">
                                      Đã vào {checkinTime ? `lúc ${checkinTime}` : ''}
                                    </span>
                                  ) : isCancelled ? (
                                    <span className="badge badge-REJECTED">Đã hủy</span>
                                  ) : (
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                                      <span className="badge badge-PENDING">Chưa vào</span>
                                      {hasCheckinPermission && a.qr_text && (
                                        <button
                                          type="button"
                                          className="btn btn-outline"
                                          style={{ padding: '0.18rem 0.45rem', fontSize: '0.7rem' }}
                                          title="Đưa chuỗi QR ký số của vé này vào ô quét"
                                          onClick={() => setTicketCodeInput(a.qr_text)}
                                        >
                                          Quét QR →
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </>
                ) : (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-page)', borderRadius: 8 }}>
                    Tài khoản không được cấp quyền xem danh sách khách tại sự kiện này.
                  </div>
                )}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
