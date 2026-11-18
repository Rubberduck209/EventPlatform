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
  const [attendees, setAttendees] = useState([
    { ticketCode: 'TK-2027-VIP-001', name: 'Nguyễn Văn An', email: 'customer1@gmail.com', type: 'VIP', seat: 'A01', checkedIn: true, time: '18:02' },
    { ticketCode: 'TK-2027-STD-088', name: 'Trần Thị Bích', email: 'customer2@gmail.com', type: 'Standard', seat: 'C09', checkedIn: false, time: '-' },
    { ticketCode: 'TK-2027-STD-055', name: 'Lê Hoàng Nam', email: 'customer3@gmail.com', type: 'Student', seat: 'D15', checkedIn: false, time: '-' }
  ]);

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

  const currentAssignment = assignments.find((a) => a.event_id === selectedEventId) || assignments[0];
  const hasCheckinPermission = currentAssignment?.permissions?.includes('CHECKIN');
  const hasViewPermission = currentAssignment?.permissions?.includes('VIEW_ATTENDEES');

  const handleCheckin = (e) => {
    e.preventDefault();
    if (!ticketCodeInput.trim()) return;

    const code = ticketCodeInput.trim().toUpperCase();
    const matched = attendees.find((a) => a.ticketCode === code);

    if ((matched && matched.checkedIn) || checkinHistory.some((h) => h.ticketCode === code)) {
      setScanResult({
        type: 'error',
        message: `Mã vé [${code}] đã được check-in trước đó. Từ chối qua cổng.`
      });
      return;
    }

    const nowTime = new Date().toLocaleTimeString();
    const newEntry = {
      ticketCode: code,
      attendee: matched ? matched.name : 'Khách tham dự',
      seat: matched ? matched.seat : 'Standard',
      time: nowTime
    };

    setCheckinHistory([newEntry, ...checkinHistory]);
    if (matched) {
      setAttendees(attendees.map((a) => (a.ticketCode === code ? { ...a, checkedIn: true, time: nowTime } : a)));
    }

    setScanResult({
      type: 'success',
      message: `Xác thực hợp lệ: Mã vé [${code}] — ${newEntry.attendee} — Ghế ${newEntry.seat}.`
    });
    setTicketCodeInput('');
  };

  const filteredAttendees = attendees.filter((a) =>
    a.name.toLowerCase().includes(attendeeSearch.toLowerCase()) ||
    a.ticketCode.toLowerCase().includes(attendeeSearch.toLowerCase()) ||
    a.email.toLowerCase().includes(attendeeSearch.toLowerCase())
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
            <button type="button" className="btn btn-outline" onClick={fetchAssignments} style={{ padding: '0.45rem 0.85rem' }}>
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
                          placeholder="Nhập hoặc quét mã vé..."
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
                              <td>{item.attendee} — Ghế {item.seat}</td>
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
                          <th>Họ và tên</th>
                          <th>Mã vé</th>
                          <th>Ghế</th>
                          <th>Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAttendees.map((a, i) => (
                          <tr key={i}>
                            <td>
                              <strong>{a.name}</strong>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{a.email}</div>
                            </td>
                            <td className="mono">{a.ticketCode}</td>
                            <td>{a.seat}</td>
                            <td>
                              {a.checkedIn ? (
                                <span className="badge badge-APPROVED">Đã vào lúc {a.time}</span>
                              ) : (
                                <span className="badge badge-PENDING">Chưa vào</span>
                              )}
                            </td>
                          </tr>
                        ))}
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
