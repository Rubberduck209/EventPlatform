import React, { useState, useEffect, useRef } from 'react';
import { api, setStoredToken, setStoredUser } from '../api';
import ToastNotification from './ToastNotification';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export default function AuthModal({ isOpen, onClose, onAuthSuccess }) {
  const [tab, setTab] = useState('login'); // 'login' | 'register'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const googleBtnRef = useRef(null);

  // Login State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register State
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPhone, setRegPhone] = useState('');

  const handleRealGoogleCallback = async (response) => {
    setError('');
    setLoading(true);
    try {
      const res = await api.googleLogin(response.credential);
      setStoredToken(res.access_token);
      setStoredUser(res.user);
      onAuthSuccess(res.user);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setError('');

    let attempts = 0;
    const renderGoogleButton = () => {
      if (window.google?.accounts?.id && GOOGLE_CLIENT_ID && googleBtnRef.current) {
        try {
          window.google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID.trim(),
            callback: handleRealGoogleCallback,
            auto_select: false
          });
          googleBtnRef.current.innerHTML = '';
          window.google.accounts.id.renderButton(googleBtnRef.current, {
            theme: 'outline',
            size: 'large',
            width: 390,
            text: tab === 'login' ? 'signin_with' : 'signup_with',
            shape: 'rectangular',
            logo_alignment: 'left'
          });
        } catch (err) {
          console.error('Google GSI error:', err);
        }
      } else if (attempts < 15) {
        attempts += 1;
        timer = setTimeout(renderGoogleButton, 250);
      }
    };

    let timer = setTimeout(renderGoogleButton, 50);
    return () => clearTimeout(timer);
  }, [isOpen, tab]);

  if (!isOpen) return null;

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.login({ email: loginEmail.trim(), password: loginPassword });
      setStoredToken(res.access_token);
      setStoredUser(res.user);
      onAuthSuccess(res.user);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.register({
        email: regEmail.trim(),
        password: regPassword,
        full_name: regFullName,
        phone: regPhone || undefined
      });
      const res = await api.login({ email: regEmail.trim(), password: regPassword });
      setStoredToken(res.access_token);
      setStoredUser(res.user);
      onAuthSuccess(res.user);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button type="button" className="modal-close-btn" onClick={onClose} title="Đóng" aria-label="Đóng">
          &times;
        </button>

        <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.25rem' }}>
          {tab === 'login' ? 'Đăng nhập' : 'Tạo tài khoản mới'}
        </h2>
        <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: '1.15rem' }}>
          {tab === 'login'
            ? 'Đăng nhập để truy cập vào hệ thống EventHub'
            : 'Đăng ký tài khoản Khách hàng để đặt vé và tham gia sự kiện'}
        </p>

        <div className="tabs">
          <button
            type="button"
            className={`tab-btn ${tab === 'login' ? 'active' : ''}`}
            onClick={() => { setTab('login'); setError(''); }}
          >
            Đăng nhập
          </button>
          <button
            type="button"
            className={`tab-btn ${tab === 'register' ? 'active' : ''}`}
            onClick={() => { setTab('register'); setError(''); }}
          >
            Đăng ký
          </button>
        </div>

        <ToastNotification
          msg={error ? { text: error, type: 'error' } : null}
          onClose={() => setError('')}
        />

        {/* NÚT ĐĂNG NHẬP GOOGLE OAUTH 2.0 CHÍNH THỨC */}
        <div style={{ display: 'flex', justifyContent: 'center', minHeight: 44, marginBottom: '0.25rem' }}>
          <div ref={googleBtnRef} id="googleSignInBtnContainer" style={{ display: 'flex', justifyContent: 'center', width: '100%' }} />
        </div>

        <div className="divider">HOẶC DÙNG TÀI KHOẢN</div>

        {tab === 'login' ? (
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label">Email hoặc Tên đăng nhập</label>
              <input
                type="text"
                required
                className="form-input"
                placeholder="Nhập email hoặc tên đăng nhập"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
              />
            </div>

            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Mật khẩu</label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '0.76rem', cursor: 'pointer', fontWeight: 600 }}
                >
                  {showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                </button>
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                className="form-input"
                placeholder="Nhập mật khẩu"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.7rem', marginTop: '0.25rem' }} disabled={loading}>
              {loading ? 'Đang xác thực...' : 'Đăng nhập'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister}>
            <div className="form-group">
              <label className="form-label">Họ và tên</label>
              <input
                type="text"
                required
                className="form-input"
                placeholder="Nhập họ và tên"
                value={regFullName}
                onChange={(e) => setRegFullName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Địa chỉ Email</label>
              <input
                type="email"
                required
                className="form-input"
                placeholder="name@example.com"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Mật khẩu</label>
              <input
                type="password"
                required
                minLength={6}
                className="form-input"
                placeholder="Tối thiểu 6 ký tự"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Số điện thoại</label>
              <input
                type="tel"
                className="form-input"
                placeholder="Nhập số điện thoại liên hệ"
                value={regPhone}
                onChange={(e) => setRegPhone(e.target.value)}
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.7rem', marginTop: '0.25rem' }} disabled={loading}>
              {loading ? 'Đang tạo tài khoản...' : 'Đăng ký tài khoản'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
