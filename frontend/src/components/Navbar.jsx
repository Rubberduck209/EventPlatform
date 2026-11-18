import React from 'react';

export default function Navbar({ onOpenAuth }) {
  return (
    <header className="system-bar" style={{ padding: '0.85rem 2rem' }}>
      <div className="system-brand" style={{ fontSize: '1.1rem' }}>
        <span className="system-dot"></span>
        <span>EventHub</span>
      </div>

      <div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onOpenAuth}
        >
          Đăng nhập / Đăng ký
        </button>
      </div>
    </header>
  );
}
