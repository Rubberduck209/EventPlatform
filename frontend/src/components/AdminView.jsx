import React, { useState, useEffect } from 'react';
import { api } from '../api';
import ToastNotification from './ToastNotification';

const cleanName = (val) => (val ? String(val).replace(/\s*\([^)]*\)/g, '').trim() : '');

export default function AdminView({ user, onLogout }) {
  const [tab, setTab] = useState('pending'); // 'pending' | 'all'
  const [pendingList, setPendingList] = useState([]);
  const [allOrganizers, setAllOrganizers] = useState([]);
  const [allStaff, setAllStaff] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [logs, setLogs] = useState([]);

  // Bộ lọc và tìm kiếm cho tab Tất cả Ban tổ chức
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'APPROVED' | 'PENDING' | 'REJECTED'
  const [searchQuery, setSearchQuery] = useState('');

  // Modal xem chi tiết tài liệu giấy phép
  const [docModal, setDocModal] = useState(null);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const [pending, allOrgs, staffList] = await Promise.all([
        api.getPendingOrganizers(),
        api.getAllOrganizers().catch(() => []),
        api.getMyManagedStaff().catch(() => [])
      ]);
      setPendingList(pending || []);
      setAllOrganizers(allOrgs || []);
      setAllStaff(staffList || []);
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const handleReview = async (userId, orgName, status) => {
    setMsg({ text: '', type: '' });
    try {
      await api.reviewOrganizer(userId, status);
      const actionText = status === 'APPROVED' ? 'Phê duyệt' : 'Từ chối';
      setMsg({
        text: `Đã ${actionText.toLowerCase()} hồ sơ Ban tổ chức "${orgName}".`,
        type: 'success'
      });
      setLogs([
        {
          time: new Date().toLocaleTimeString(),
          action: status,
          detail: `${actionText} hồ sơ "${orgName}" — Mã người dùng #${userId}`
        },
        ...logs
      ]);
      await fetchAdminData();
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
    }
  };

  const approvedCount = allOrganizers.filter((o) => o.approval_status === 'APPROVED').length;

  const filteredAllOrganizers = allOrganizers.filter((item) => {
    const matchStatus = statusFilter === 'ALL' || item.approval_status === statusFilter;
    const q = searchQuery.toLowerCase().trim();
    const matchQuery = !q ||
      String(item.user_id).includes(q) ||
      (item.organization_name || '').toLowerCase().includes(q) ||
      (item.tax_code || '').toLowerCase().includes(q) ||
      (item.contact_phone || '').toLowerCase().includes(q) ||
      (item.user_email || '').toLowerCase().includes(q) ||
      (item.user_full_name || '').toLowerCase().includes(q);
    return matchStatus && matchQuery;
  });

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <div className="layout-admin">
        <div className="admin-header-strip">
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
              EVENTHUB ADMINISTRATION CONSOLE
            </div>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 700 }}>
              Quản trị Hệ thống & Thẩm định Đối tác
            </h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span className="badge badge-ADMIN">{cleanName(user?.full_name) || 'Administrator'}</span>
            <button type="button" className="btn btn-outline" onClick={fetchAdminData} disabled={loading}>
              {loading ? 'Đang tải...' : 'Làm mới'}
            </button>
            <button type="button" className="btn btn-outline" onClick={onLogout}>
              Đăng xuất
            </button>
          </div>
        </div>

        {/* 4 Cards Thống kê Tổng quan */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.25rem' }}>
          <div className="card" style={{ marginBottom: 0, padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Hồ sơ chờ phê duyệt</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: '0.2rem', color: pendingList.length > 0 ? '#d97706' : '#1e293b' }}>
              {pendingList.length}
            </div>
          </div>
          <div className="card" style={{ marginBottom: 0, padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Ban tổ chức hoạt động</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: '0.2rem', color: '#16a34a' }}>
              {approvedCount}
            </div>
          </div>
          <div className="card" style={{ marginBottom: 0, padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Tổng Nhân sự sự kiện</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: '0.2rem' }}>{allStaff.length}</div>
          </div>
          <div className="card" style={{ marginBottom: 0, padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Dịch vụ Định danh (Port 8001)</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--success)', marginTop: '0.45rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }}></span>
              Đang hoạt động
            </div>
          </div>
        </div>

        <ToastNotification msg={msg} onClose={() => setMsg({ text: '', type: '' })} />

        {/* Thanh chuyển Tab */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button
            type="button"
            className={`portal-switch-btn ${tab === 'pending' ? 'active' : ''}`}
            onClick={() => setTab('pending')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <span>Hồ sơ chờ phê duyệt</span>
            <span
              style={{
                background: tab === 'pending' ? '#2563eb' : '#e2e8f0',
                color: tab === 'pending' ? '#fff' : '#475569',
                padding: '0.1rem 0.45rem',
                borderRadius: 999,
                fontSize: '0.72rem',
                fontWeight: 700
              }}
            >
              {pendingList.length}
            </span>
          </button>
          <button
            type="button"
            className={`portal-switch-btn ${tab === 'all' ? 'active' : ''}`}
            onClick={() => setTab('all')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <span>Tất cả Ban Tổ Chức</span>
            <span
              style={{
                background: tab === 'all' ? '#2563eb' : '#e2e8f0',
                color: tab === 'all' ? '#fff' : '#475569',
                padding: '0.1rem 0.45rem',
                borderRadius: 999,
                fontSize: '0.72rem',
                fontWeight: 700
              }}
            >
              {allOrganizers.length}
            </span>
          </button>
        </div>

        {/* TAB 1: Danh sách Hồ sơ chờ phê duyệt */}
        {tab === 'pending' && (
          <div className="card">
            <div className="card-header">
              <div>
                <span className="card-title">Danh sách Hồ sơ đăng ký Ban Tổ Chức chờ xét duyệt</span>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  Thẩm định giấy phép kinh doanh, mã số thuế và thông tin doanh nghiệp trước khi cấp quyền Organizer.
                </div>
              </div>
              <span className="badge badge-PENDING">{pendingList.length} hồ sơ</span>
            </div>

            {pendingList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)', background: 'var(--bg-page)', borderRadius: 8 }}>
                Hiện không có hồ sơ nào đang chờ xét duyệt.
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>User ID</th>
                    <th>Tên Doanh nghiệp / Tổ chức</th>
                    <th>Mã số thuế</th>
                    <th>Số điện thoại</th>
                    <th>Hồ sơ giấy phép</th>
                    <th>Trạng thái</th>
                    <th style={{ textAlign: 'right' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingList.map((item) => (
                    <tr key={item.user_id}>
                      <td className="mono">#{item.user_id}</td>
                      <td>
                        <strong>{cleanName(item.organization_name)}</strong>
                        {item.user_email && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{item.user_email}</div>
                        )}
                      </td>
                      <td>{item.tax_code || '—'}</td>
                      <td>{item.contact_phone}</td>
                      <td>
                        {item.business_license_url ? (
                          <button
                            type="button"
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--accent-blue)',
                              textDecoration: 'underline',
                              cursor: 'pointer',
                              padding: 0,
                              fontSize: '0.82rem'
                            }}
                            onClick={() => setDocModal(item)}
                          >
                            📄 Xem tài liệu
                          </button>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>Chưa nộp</span>
                        )}
                      </td>
                      <td><span className="badge badge-PENDING">{item.approval_status}</span></td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                          <button
                            type="button"
                            className="btn btn-success"
                            style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
                            onClick={() => handleReview(item.user_id, item.organization_name, 'APPROVED')}
                          >
                            Phê duyệt
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger"
                            style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
                            onClick={() => handleReview(item.user_id, item.organization_name, 'REJECTED')}
                          >
                            Từ chối
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB 2: Danh sách Tất cả Ban tổ chức */}
        {tab === 'all' && (
          <div className="card">
            <div className="card-header" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <span className="card-title">Danh sách Tất cả Đối tác Ban Tổ Chức</span>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  Toàn bộ các đơn vị đã đăng ký làm Ban tổ chức (Bao gồm Đã duyệt, Đang chờ duyệt và Bị từ chối).
                </div>
              </div>

              {/* Bộ lọc và Tìm kiếm */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  className="form-input"
                  style={{ width: 230, padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                  placeholder="Tìm tên, MST, email, phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <select
                  className="form-input"
                  style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="ALL">Tất cả trạng thái ({allOrganizers.length})</option>
                  <option value="APPROVED">Đã phê duyệt ({approvedCount})</option>
                  <option value="PENDING">Chờ duyệt ({pendingList.length})</option>
                  <option value="REJECTED">Bị từ chối ({allOrganizers.filter((o) => o.approval_status === 'REJECTED').length})</option>
                </select>
              </div>
            </div>

            {filteredAllOrganizers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)', background: 'var(--bg-page)', borderRadius: 8 }}>
                {searchQuery || statusFilter !== 'ALL'
                  ? 'Không tìm thấy Ban tổ chức nào phù hợp với bộ lọc.'
                  : 'Chưa có Ban tổ chức nào trong hệ thống.'}
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>User ID</th>
                    <th>Tên Doanh nghiệp / Tổ chức</th>
                    <th>Tài khoản / Đại diện</th>
                    <th>Mã số thuế</th>
                    <th>Số điện thoại</th>
                    <th>Hồ sơ giấy phép</th>
                    <th>Trạng thái</th>
                    <th>Thời gian</th>
                    <th style={{ textAlign: 'right' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAllOrganizers.map((item) => {
                    const isApproved = item.approval_status === 'APPROVED';
                    const isPending = item.approval_status === 'PENDING';
                    const isRejected = item.approval_status === 'REJECTED';
                    const badgeClass = isApproved ? 'badge-APPROVED' : isPending ? 'badge-PENDING' : 'badge-REJECTED';
                    const badgeText = isApproved ? 'ĐÃ DUYỆT' : isPending ? 'CHỜ DUYỆT' : 'TỪ CHỐI';

                    return (
                      <tr key={item.user_id}>
                        <td className="mono">#{item.user_id}</td>
                        <td>
                          <strong>{cleanName(item.organization_name)}</strong>
                        </td>
                        <td>
                          <div>{item.user_full_name || '—'}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{item.user_email || '—'}</div>
                        </td>
                        <td className="mono">{item.tax_code || '—'}</td>
                        <td>{item.contact_phone}</td>
                        <td>
                          {item.business_license_url ? (
                            <button
                              type="button"
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--accent-blue)',
                                textDecoration: 'underline',
                                cursor: 'pointer',
                                padding: 0,
                                fontSize: '0.82rem'
                              }}
                              onClick={() => setDocModal(item)}
                            >
                              📄 Xem tài liệu
                            </button>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>Chưa nộp</span>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${badgeClass}`}>{badgeText}</span>
                        </td>
                        <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          <div>Tạo: {new Date(item.created_at).toLocaleDateString('vi-VN')}</div>
                          {item.approved_at && (
                            <div style={{ color: '#16a34a' }}>
                              Duyệt: {new Date(item.approved_at).toLocaleDateString('vi-VN')}
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                            {isPending && (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-success"
                                  style={{ padding: '0.28rem 0.65rem', fontSize: '0.75rem' }}
                                  onClick={() => handleReview(item.user_id, item.organization_name, 'APPROVED')}
                                >
                                  Duyệt
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-danger"
                                  style={{ padding: '0.28rem 0.65rem', fontSize: '0.75rem' }}
                                  onClick={() => handleReview(item.user_id, item.organization_name, 'REJECTED')}
                                >
                                  Từ chối
                                </button>
                              </>
                            )}
                            {isApproved && (
                              <button
                                type="button"
                                className="btn btn-outline"
                                style={{ padding: '0.28rem 0.65rem', fontSize: '0.75rem', color: '#dc2626', borderColor: '#fca5a5' }}
                                onClick={() => {
                                  if (window.confirm(`Bạn có chắc chắn muốn thu hồi quyền Organizer của "${item.organization_name}"?`)) {
                                    handleReview(item.user_id, item.organization_name, 'REJECTED');
                                  }
                                }}
                              >
                                Thu hồi quyền
                              </button>
                            )}
                            {isRejected && (
                              <button
                                type="button"
                                className="btn btn-primary"
                                style={{ padding: '0.28rem 0.65rem', fontSize: '0.75rem' }}
                                onClick={() => handleReview(item.user_id, item.organization_name, 'APPROVED')}
                              >
                                Phê duyệt lại
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Modal Xem chi tiết Hồ sơ Pháp lý / Tài liệu */}
        {docModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.55)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1100,
              padding: '1rem'
            }}
          >
            <div className="card" style={{ maxWidth: 480, width: '100%', margin: 0 }}>
              <div className="card-header">
                <div>
                  <span className="card-title">Hồ sơ Pháp lý & Giấy phép Kinh doanh</span>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                    Đối tác #{docModal.user_id} — {cleanName(docModal.organization_name)}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                  onClick={() => setDocModal(null)}
                >
                  ✕
                </button>
              </div>

              <div style={{ fontSize: '0.84rem', display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.4rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Tên tổ chức / Doanh nghiệp:</span>
                  <strong>{cleanName(docModal.organization_name)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.4rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Mã số thuế:</span>
                  <strong className="mono">{docModal.tax_code || 'Chưa cung cấp'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.4rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Số điện thoại liên hệ:</span>
                  <strong>{docModal.contact_phone}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.4rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Trạng thái thẩm định:</span>
                  <span className={`badge badge-${docModal.approval_status}`}>{docModal.approval_status}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Đường dẫn file tài liệu / Giấy phép:</span>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '0.5rem 0.75rem', wordBreak: 'break-all', fontSize: '0.78rem' }}>
                    <a href={docModal.business_license_url} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>
                      🔗 {docModal.business_license_url}
                    </a>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <a
                  href={docModal.business_license_url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-primary"
                  style={{ textDecoration: 'none', padding: '0.4rem 0.9rem', fontSize: '0.8rem' }}
                >
                  ↗ Mở tài liệu ở tab mới
                </a>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  onClick={() => setDocModal(null)}
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Lịch sử thao tác */}
        {logs.length > 0 && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">Lịch sử thao tác trong phiên</span>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 120 }}>Thời gian</th>
                  <th style={{ width: 120 }}>Trạng thái</th>
                  <th>Nội dung</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l, idx) => (
                  <tr key={idx}>
                    <td className="mono">{l.time}</td>
                    <td><span className={`badge badge-${l.action}`}>{l.action}</span></td>
                    <td>{l.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
