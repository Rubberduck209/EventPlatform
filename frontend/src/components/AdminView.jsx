import React, { useState, useEffect } from 'react';
import { api } from '../api';
import ToastNotification from './ToastNotification';

const cleanName = (val) => (val ? String(val).replace(/\s*\([^)]*\)/g, '').trim() : '');

export default function AdminView({ user, onLogout }) {
  const [pendingList, setPendingList] = useState([]);
  const [allStaff, setAllStaff] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [logs, setLogs] = useState([]);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const [pending, staffList] = await Promise.all([
        api.getPendingOrganizers(),
        api.getMyManagedStaff().catch(() => [])
      ]);
      setPendingList(pending);
      setAllStaff(staffList);
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
      setMsg({
        text: `Đã ${status === 'APPROVED' ? 'phê duyệt' : 'từ chối'} hồ sơ "${orgName}".`,
        type: 'success'
      });
      setLogs([
        {
          time: new Date().toLocaleTimeString(),
          action: status,
          detail: `Xét duyệt hồ sơ "${orgName}" — Mã người dùng #${userId}`
        },
        ...logs
      ]);
      fetchAdminData();
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
    }
  };

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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.25rem' }}>
          <div className="card" style={{ marginBottom: 0, padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Hồ sơ chờ phê duyệt</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: '0.2rem' }}>{pendingList.length}</div>
          </div>
          <div className="card" style={{ marginBottom: 0, padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Tổng Nhân sự sự kiện</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: '0.2rem' }}>{allStaff.length}</div>
          </div>
          <div className="card" style={{ marginBottom: 0, padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Trạng thái Dịch vụ Định danh</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--success)', marginTop: '0.45rem' }}>Đang hoạt động</div>
          </div>
        </div>

        <ToastNotification msg={msg} onClose={() => setMsg({ text: '', type: '' })} />

        <div className="card">
          <div className="card-header">
            <span className="card-title">Danh sách Hồ sơ đăng ký Ban Tổ Chức chờ xét duyệt</span>
            <span className="badge badge-PENDING">{pendingList.length} hồ sơ</span>
          </div>

          {pendingList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.25rem', color: 'var(--text-muted)', background: 'var(--bg-page)', borderRadius: 8 }}>
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
                  <th>Tài liệu</th>
                  <th>Trạng thái</th>
                  <th style={{ textAlign: 'right' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {pendingList.map((item) => (
                  <tr key={item.user_id}>
                    <td className="mono">#{item.user_id}</td>
                    <td><strong>{cleanName(item.organization_name)}</strong></td>
                    <td>{item.tax_code || '—'}</td>
                    <td>{item.contact_phone}</td>
                    <td>
                      {item.business_license_url ? (
                        <a href={item.business_license_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-blue)' }}>
                          Xem tài liệu
                        </a>
                      ) : 'Không có'}
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
