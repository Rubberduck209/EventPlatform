import React, { useState, useEffect } from 'react';
import { api } from '../api';
import ToastNotification from './ToastNotification';

const cleanName = (val) => (val ? String(val).replace(/\s*\([^)]*\)/g, '').trim() : '');

export default function CustomerView({ user, onProfileUpdated, onLogout }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [tab, setTab] = useState('events'); // 'events' | 'payments' | 'profile' | 'upgrade'

  // Public Events State
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [seatMap, setSeatMap] = useState([]);
  const [selectedTicketTypeId, setSelectedTicketTypeId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [validatedOrder, setValidatedOrder] = useState(null);

  // Payments State
  const [myPayments, setMyPayments] = useState([]);
  const [payLoading, setPayLoading] = useState(false);

  // Organizer Upgrade State
  const [orgName, setOrgName] = useState('');
  const [taxCode, setTaxCode] = useState('');
  const [phone, setPhone] = useState(user.phone || '');
  const [licenseUrl, setLicenseUrl] = useState('');

  const fetchProfile = async () => {
    try {
      const data = await api.getMyOrganizerProfile();
      setProfile(data);
    } catch {
      setProfile(null);
    }
  };

  const fetchPublicEvents = async () => {
    try {
      const list = await api.getPublicEvents();
      setEvents(list || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchMyPayments = async () => {
    try {
      const list = await api.getMyPayments();
      setMyPayments(list || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSelectEvent = async (evId) => {
    setMsg({ text: '', type: '' });
    setSelectedSeats([]);
    setValidatedOrder(null);
    try {
      const [detail, mapData] = await Promise.all([
        api.getEventDetail(evId),
        api.getSeatMap(evId)
      ]);
      setSelectedEvent(detail);
      setSeatMap(mapData?.zones || []);
      if (detail?.ticket_types?.length > 0) {
        setSelectedTicketTypeId(detail.ticket_types[0].id);
      }
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
    }
  };

  const toggleSeatSelection = (seatCode) => {
    setValidatedOrder(null);
    if (selectedSeats.includes(seatCode)) {
      const next = selectedSeats.filter((s) => s !== seatCode);
      setSelectedSeats(next);
      if (next.length > 0) setQuantity(next.length);
    } else {
      const next = [...selectedSeats, seatCode];
      setSelectedSeats(next);
      setQuantity(next.length);
    }
  };

  const handleValidateTicket = async (e) => {
    e.preventDefault();
    if (!selectedEvent || !selectedTicketTypeId) return;
    setMsg({ text: '', type: '' });
    setValidatedOrder(null);
    try {
      const res = await api.validatePurchase(selectedEvent.id, {
        ticket_type_id: Number(selectedTicketTypeId),
        quantity: Number(quantity),
        buyer_email: user.email
      });
      if (!res.allowed) {
        setMsg({ text: res.reason || 'Không đủ điều kiện mua loại vé này.', type: 'error' });
      } else {
        setValidatedOrder(res);
        setMsg({
          text: `Đủ điều kiện đặt vé — Tổng tiền: ${Number(res.total_price).toLocaleString('vi-VN')} đ.`,
          type: 'success'
        });
      }
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
    }
  };

  const handleCreateVNPayPayment = async () => {
    if (!selectedEvent || !validatedOrder) return;
    setPayLoading(true);
    setMsg({ text: '', type: '' });
    try {
      const bookingId = Number(`${selectedEvent.id}${selectedTicketTypeId}${quantity}`);
      const idempotencyKey = `idem-user${user.id}-ev${selectedEvent.id}-tt${selectedTicketTypeId}-q${quantity}-${Date.now()}`;
      const payment = await api.createPayment({
        booking_id: bookingId,
        amount: validatedOrder.total_price,
        payment_method: 'VNPAY_SANDBOX',
        idempotency_key: idempotencyKey,
        order_desc: `Thanh toan ${validatedOrder.quantity}x ${cleanName(validatedOrder.ticket_type_name)}`,
        bank_code: 'NCB'
      });
      setMsg({
        text: `Đã khởi tạo giao dịch VNPay #${payment.payment_code}.`,
        type: 'success'
      });
      await fetchMyPayments();
      setTab('payments');
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
    } finally {
      setPayLoading(false);
    }
  };

  const handleConfirmIPN = async (paymentCode) => {
    setMsg({ text: '', type: '' });
    try {
      const res = await api.simulateVNPayIPN({
        payment_code: paymentCode,
        response_code: '00',
        bank_code: 'NCB'
      });
      setMsg({
        text: `Kết quả xử lý VNPay IPN: [${res.RspCode}] ${res.Message}`,
        type: res.RspCode === '00' ? 'success' : 'error'
      });
      fetchMyPayments();
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
    }
  };

  const handleRefundPayment = async (payment) => {
    const reason = window.prompt('Nhập lý do yêu cầu hoàn tiền:', 'Khách hàng hủy vé trước hạn theo chính sách');
    if (!reason) return;
    setMsg({ text: '', type: '' });
    try {
      const res = await api.refundPayment(payment.id, {
        reason: reason.trim()
      });
      setMsg({
        text: `Đã hoàn tiền ${Number(res.refund_amount).toLocaleString('vi-VN')} đ cho giao dịch ${payment.payment_code}.`,
        type: 'success'
      });
      fetchMyPayments();
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
    }
  };

  useEffect(() => {
    fetchProfile();
    fetchPublicEvents();
    fetchMyPayments();
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg({ text: '', type: '' });
    try {
      const data = await api.applyOrganizer({
        organization_name: orgName,
        tax_code: taxCode || undefined,
        contact_phone: phone,
        business_license_url: licenseUrl || undefined
      });
      setProfile(data);
      setMsg({
        text: 'Hồ sơ đăng ký Ban tổ chức đã được gửi và đang chờ phê duyệt.',
        type: 'success'
      });
      if (onProfileUpdated) onProfileUpdated();
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <header className="system-bar" style={{ padding: '0.85rem 2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <div className="system-brand" style={{ fontSize: '1.1rem' }}>
            <span className="system-dot"></span>
            <span>EventHub</span>
          </div>

          <nav style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              type="button"
              className={`portal-switch-btn ${tab === 'events' ? 'active' : ''}`}
              onClick={() => {
                setTab('events');
                setSelectedEvent(null);
              }}
            >
              Sự kiện
            </button>
            <button
              type="button"
              className={`portal-switch-btn ${tab === 'payments' ? 'active' : ''}`}
              onClick={() => {
                setTab('payments');
                fetchMyPayments();
              }}
            >
              Thanh toán
            </button>
            <button
              type="button"
              className={`portal-switch-btn ${tab === 'profile' ? 'active' : ''}`}
              onClick={() => setTab('profile')}
            >
              Hồ sơ cá nhân
            </button>
            <button
              type="button"
              className={`portal-switch-btn ${tab === 'upgrade' ? 'active' : ''}`}
              onClick={() => setTab('upgrade')}
            >
              Đăng ký Ban tổ chức
            </button>
          </nav>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <span style={{ fontSize: '0.84rem', fontWeight: 600 }}>{cleanName(user.full_name)}</span>
          <button type="button" className="btn btn-outline" onClick={onLogout} style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}>
            Đăng xuất
          </button>
        </div>
      </header>

      <div className="layout-customer">
        <ToastNotification msg={msg} onClose={() => setMsg({ text: '', type: '' })} />

        {tab === 'events' && !selectedEvent && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">Sự kiện đang mở bán</span>
            </div>

            {events.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                Hiện chưa có sự kiện nào đang mở bán.
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Sự kiện</th>
                    <th>Địa điểm</th>
                    <th>Thời gian</th>
                    <th>Trạng thái</th>
                    <th style={{ textAlign: 'right' }}>Chi tiết</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev) => (
                    <tr key={ev.id}>
                      <td>
                        <strong>{ev.title}</strong>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {ev.category_name || ''}
                        </div>
                      </td>
                      <td>{ev.venue_name}</td>
                      <td style={{ fontSize: '0.82rem' }}>
                        {new Date(ev.start_time).toLocaleString('vi-VN')}
                      </td>
                      <td><span className="badge badge-APPROVED">{ev.status}</span></td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn btn-outline"
                          style={{ padding: '0.3rem 0.75rem', fontSize: '0.78rem' }}
                          onClick={() => handleSelectEvent(ev.id)}
                        >
                          Xem sơ đồ & vé →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'events' && selectedEvent && (
          <div className="card">
            <div className="card-header">
              <div>
                <span className="card-title" style={{ fontSize: '1.1rem' }}>
                  {selectedEvent.title}
                </span>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                  {selectedEvent.venue_name} — {selectedEvent.venue_address}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-outline"
                style={{ padding: '0.32rem 0.75rem', fontSize: '0.78rem' }}
                onClick={() => setSelectedEvent(null)}
              >
                ← Quay lại danh sách
              </button>
            </div>

            {seatMap.map((zone) => (
              <div
                key={zone.id}
                style={{
                  padding: '1rem',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  marginBottom: '1rem',
                  background: 'var(--bg-page)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem', fontSize: '0.84rem' }}>
                  <strong>{cleanName(zone.name)}</strong>
                  <span>Sức chứa: {zone.total_capacity} chỗ</span>
                </div>

                {zone.zone_type === 'SEATED' && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: `repeat(${zone.grid_cols || 10}, minmax(40px, 1fr))`,
                      gap: '0.35rem'
                    }}
                  >
                    {zone.seats.map((seat) => {
                      const isSelected = selectedSeats.includes(seat.seat_code);
                      return (
                        <button
                          key={seat.id}
                          type="button"
                          disabled={seat.is_disabled}
                          onClick={() => toggleSeatSelection(seat.seat_code)}
                          style={{
                            padding: '0.32rem 0.2rem',
                            borderRadius: 4,
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            cursor: seat.is_disabled ? 'not-allowed' : 'pointer',
                            background: seat.is_disabled
                              ? '#1e293b'
                              : isSelected
                              ? '#2563eb'
                              : '#ffffff',
                            color: seat.is_disabled
                              ? '#64748b'
                              : isSelected
                              ? '#ffffff'
                              : '#1e293b',
                            border: '1px solid var(--border)'
                          }}
                        >
                          {seat.seat_code}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}

            {selectedEvent.ticket_types?.length > 0 && (
              <form onSubmit={handleValidateTicket} style={{ padding: '1rem', background: 'var(--bg-page)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 120px auto auto', gap: '0.75rem', alignItems: 'end' }}>
                  <div>
                    <label className="form-label">Hạng vé</label>
                    <select
                      className="form-input"
                      value={selectedTicketTypeId}
                      onChange={(e) => {
                        setSelectedTicketTypeId(e.target.value);
                        setValidatedOrder(null);
                      }}
                    >
                      {selectedEvent.ticket_types.map((tt) => (
                        <option key={tt.id} value={tt.id}>
                          {cleanName(tt.name)} — {Number(tt.current_price || 0).toLocaleString('vi-VN')} đ
                          {tt.student_email_domain ? ` • Yêu cầu ${tt.student_email_domain}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Số lượng</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      className="form-input"
                      value={quantity}
                      onChange={(e) => {
                        setQuantity(e.target.value);
                        setValidatedOrder(null);
                      }}
                    />
                  </div>
                  <button type="submit" className="btn btn-outline">
                    Kiểm tra giá vé
                  </button>
                  {validatedOrder && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={payLoading}
                      onClick={handleCreateVNPayPayment}
                    >
                      {payLoading ? 'Đang tạo...' : 'Thanh toán VNPay →'}
                    </button>
                  )}
                </div>
                {selectedSeats.length > 0 && (
                  <div style={{ marginTop: '0.6rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Ghế đang chọn: <strong>{selectedSeats.join(', ')}</strong>
                  </div>
                )}
              </form>
            )}
          </div>
        )}

        {tab === 'payments' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">Lịch sử Giao dịch VNPay & Hoàn tiền</span>
            </div>

            <table className="data-table">
              <thead>
                <tr>
                  <th>Mã giao dịch</th>
                  <th>Đơn hàng</th>
                  <th>Số tiền</th>
                  <th>Trạng thái</th>
                  <th>Hoàn tiền</th>
                  <th style={{ textAlign: 'right' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {myPayments.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                      Chưa có giao dịch thanh toán nào.
                    </td>
                  </tr>
                ) : (
                  myPayments.map((p) => {
                    const refundedTotal = (p.refunds || []).reduce((acc, r) => acc + Number(r.refund_amount || 0), 0);
                    return (
                      <tr key={p.id}>
                        <td className="mono">
                          <strong>{p.payment_code}</strong>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            {p.payment_method}
                          </div>
                        </td>
                        <td className="mono">Đơn #{p.booking_id}</td>
                        <td><strong>{Number(p.amount).toLocaleString('vi-VN')} đ</strong></td>
                        <td>
                          <span className={`badge ${p.status === 'SUCCESS' ? 'badge-APPROVED' : 'badge-PENDING'}`}>
                            {p.status}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.8rem' }}>
                          {refundedTotal > 0 ? `${refundedTotal.toLocaleString('vi-VN')} đ` : '—'}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {p.status === 'PENDING' && (
                            <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                              <a
                                href={`http://localhost:8004/api/v1/payments/${p.id}/checkout`}
                                target="_blank"
                                rel="noreferrer"
                                className="btn btn-primary"
                                style={{ padding: '0.28rem 0.65rem', fontSize: '0.76rem', textDecoration: 'none' }}
                              >
                                Mở VNPay ↗
                              </a>
                              <button
                                type="button"
                                className="btn btn-outline"
                                style={{ padding: '0.28rem 0.65rem', fontSize: '0.76rem' }}
                                onClick={() => handleConfirmIPN(p.payment_code)}
                              >
                                Test IPN
                              </button>
                            </div>
                          )}
                          {p.status === 'SUCCESS' && refundedTotal < Number(p.amount) && (
                            <button
                              type="button"
                              className="btn btn-outline"
                              style={{ padding: '0.28rem 0.65rem', fontSize: '0.76rem' }}
                              onClick={() => handleRefundPayment(p)}
                            >
                              Hoàn tiền
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'profile' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">Hồ sơ tài khoản</span>
              <span className="badge badge-APPROVED">{user.status}</span>
            </div>

            <table className="data-table">
              <tbody>
                <tr>
                  <td style={{ color: 'var(--text-muted)', width: 220 }}>Mã tài khoản</td>
                  <td className="mono">#{user.id}</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--text-muted)' }}>Họ và tên</td>
                  <td><strong>{cleanName(user.full_name)}</strong></td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--text-muted)' }}>Địa chỉ Email</td>
                  <td>{user.email}</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--text-muted)' }}>Số điện thoại</td>
                  <td>{user.phone || 'Chưa cập nhật'}</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--text-muted)' }}>Vai trò</td>
                  <td><span className="badge badge-CUSTOMER">{user.role}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {tab === 'upgrade' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">Đăng ký trở thành Đối tác Tổ chức Sự kiện</span>
              {profile && <span className={`badge badge-${profile.approval_status}`}>{profile.approval_status}</span>}
            </div>

            {profile ? (
              <table className="data-table">
                <tbody>
                  <tr>
                    <td style={{ color: 'var(--text-muted)', width: 220 }}>Tên doanh nghiệp / tổ chức</td>
                    <td><strong>{cleanName(profile.organization_name)}</strong></td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--text-muted)' }}>Mã số thuế</td>
                    <td>{profile.tax_code || 'Không cung cấp'}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--text-muted)' }}>Số điện thoại liên hệ</td>
                    <td>{profile.contact_phone}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--text-muted)' }}>Trạng thái xét duyệt</td>
                    <td><span className={`badge badge-${profile.approval_status}`}>{profile.approval_status}</span></td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <form onSubmit={handleSubmit} style={{ maxWidth: 540 }}>
                <div className="form-group">
                  <label className="form-label">Tên Doanh nghiệp / Đơn vị Tổ chức</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="Nhập tên doanh nghiệp hoặc tổ chức"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Mã số thuế</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Mã số thuế"
                      value={taxCode}
                      onChange={(e) => setTaxCode(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Số điện thoại liên hệ</label>
                    <input
                      type="tel"
                      required
                      className="form-input"
                      placeholder="Số điện thoại"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Đường dẫn Giấy phép kinh doanh</label>
                  <input
                    type="url"
                    className="form-input"
                    placeholder="https://..."
                    value={licenseUrl}
                    onChange={(e) => setLicenseUrl(e.target.value)}
                  />
                </div>

                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Đang gửi...' : 'Gửi hồ sơ xét duyệt'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
