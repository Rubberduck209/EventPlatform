import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import AuthModal from './components/AuthModal';
import CustomerView from './components/CustomerView';
import OrganizerView from './components/OrganizerView';
import AdminView from './components/AdminView';
import StaffView from './components/StaffView';
import { api, getStoredToken, removeStoredToken, removeStoredUser, setStoredToken, setStoredUser } from './api';

export default function App() {
  const [user, setUser] = useState(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  const refreshUser = async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const res = await api.refreshToken();
      setStoredToken(res.access_token);
      setUser(res.user);
      setStoredUser(res.user);
    } catch {
      handleLogout();
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const handleLogout = () => {
    removeStoredToken();
    removeStoredUser();
    setUser(null);
  };

  const handleAuthSuccess = (userData) => {
    setUser(userData);
  };

  return (
    <div>
      {!user ? (
        <>
          <Navbar onOpenAuth={() => setIsAuthOpen(true)} />

          <main style={{ maxWidth: 920, margin: '4rem auto', padding: '0 1.25rem' }}>
            <div className="card" style={{ padding: '3.5rem 2rem', textAlign: 'center' }}>
              <h1 style={{ fontSize: '2.1rem', fontWeight: 800, marginBottom: '0.85rem', letterSpacing: '-0.02em' }}>
                Nền Tảng Quản Lý Sự Kiện & Bán Vé Trực Tuyến
              </h1>
              <p style={{ maxWidth: 580, margin: '0 auto 2rem', color: 'var(--text-secondary)', fontSize: '0.96rem', lineHeight: 1.6 }}>
                Hệ thống quản lý định danh, phân quyền tổ chức sự kiện và kiểm soát vé điện tử tập trung. Đăng nhập bằng tài khoản hoặc Google để truy cập không gian làm việc của bạn.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                style={{ padding: '0.75rem 1.75rem', fontSize: '0.95rem' }}
                onClick={() => setIsAuthOpen(true)}
              >
                Đăng nhập vào hệ thống
              </button>
            </div>
          </main>
        </>
      ) : (
        <>
          {user.role === 'ADMIN' && <AdminView user={user} onLogout={handleLogout} />}
          {user.role === 'ORGANIZER' && <OrganizerView user={user} onLogout={handleLogout} />}
          {user.role === 'STAFF' && <StaffView user={user} onLogout={handleLogout} />}
          {user.role === 'CUSTOMER' && <CustomerView user={user} onProfileUpdated={refreshUser} onLogout={handleLogout} />}
        </>
      )}

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onAuthSuccess={handleAuthSuccess}
      />
    </div>
  );
}
