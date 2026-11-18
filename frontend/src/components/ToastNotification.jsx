import React, { useEffect, useRef } from 'react';

export default function ToastNotification({ msg, onClose }) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const text = msg?.text || msg?.message || '';
  const type = msg?.type || 'success';

  useEffect(() => {
    if (!text) return undefined;
    const timer = setTimeout(() => {
      if (onCloseRef.current) {
        onCloseRef.current();
      }
    }, 7000);
    return () => clearTimeout(timer);
  }, [msg, text]);

  if (!text) return null;

  const isError = type === 'error';

  return (
    <div
      style={{
        position: 'fixed',
        top: '1.25rem',
        right: '1.25rem',
        zIndex: 9999,
        minWidth: '300px',
        maxWidth: '440px',
        background: isError ? '#fef2f2' : '#f0fdf4',
        color: isError ? '#991b1b' : '#166534',
        border: `1px solid ${isError ? '#fecaca' : '#bbf7d0'}`,
        borderLeft: `4px solid ${isError ? '#dc2626' : '#16a34a'}`,
        borderRadius: '8px',
        padding: '0.85rem 1rem',
        boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.14), 0 4px 10px -2px rgba(15, 23, 42, 0.08)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '0.75rem',
        fontSize: '0.86rem',
        fontWeight: 500,
        lineHeight: 1.45
      }}
      role="alert"
    >
      <div style={{ flex: 1, wordBreak: 'break-word' }}>{text}</div>
      <button
        type="button"
        onClick={() => onCloseRef.current && onCloseRef.current()}
        aria-label="Đóng thông báo"
        style={{
          background: 'transparent',
          border: 'none',
          color: isError ? '#991b1b' : '#166534',
          cursor: 'pointer',
          fontSize: '0.95rem',
          fontWeight: 700,
          lineHeight: 1,
          padding: '0.1rem 0.25rem',
          borderRadius: '4px',
          opacity: 0.75
        }}
      >
        ✕
      </button>
    </div>
  );
}
