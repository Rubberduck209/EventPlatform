import React, { useState, useEffect, useRef } from 'react';
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

  // Camera QR Scanner Window State
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [cameraStatusText, setCameraStatusText] = useState('Đang khởi động camera thiết bị...');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanTimerRef = useRef(null);
  const isProcessingScanRef = useRef(false);
  const performCheckinRef = useRef(null);

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

  const performCheckin = async (rawCode) => {
    const rawInput = (rawCode || '').trim();
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

  performCheckinRef.current = performCheckin;

  const handleCheckin = async (e) => {
    e.preventDefault();
    await performCheckin(ticketCodeInput);
  };

  // Nạp thư viện giải mã QR jsQR dự phòng cho các trình duyệt desktop
  const ensureJsQrLoaded = () =>
    new Promise((resolve) => {
      if (window.jsQR) {
        resolve(window.jsQR);
        return;
      }
      const existing = document.getElementById('jsqr-cdn-script');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.jsQR));
        existing.addEventListener('error', () => resolve(null));
        return;
      }
      const script = document.createElement('script');
      script.id = 'jsqr-cdn-script';
      script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
      script.async = true;
      script.onload = () => resolve(window.jsQR || null);
      script.onerror = () => resolve(null);
      document.body.appendChild(script);
    });

  const stopCameraStream = () => {
    if (scanTimerRef.current) {
      clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const handleQrDetected = async (decodedText) => {
    if (!decodedText || isProcessingScanRef.current) return;
    const cleaned = decodedText.trim();
    if (!cleaned) return;
    isProcessingScanRef.current = true;
    stopCameraStream();
    setCameraOpen(false);
    if (performCheckinRef.current) {
      await performCheckinRef.current(cleaned);
    }
    isProcessingScanRef.current = false;
  };

  useEffect(() => {
    if (!cameraOpen) {
      stopCameraStream();
      return;
    }

    let cancelled = false;
    isProcessingScanRef.current = false;
    setCameraError('');
    setCameraStatusText('Đang kết nối camera thiết bị...');

    const startCamera = async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Trình duyệt hoặc thiết bị hiện tại không hỗ trợ truy cập Camera (getUserMedia).');
        return;
      }

      await ensureJsQrLoaded();

      try {
        const constraints = {
          video: selectedDeviceId
            ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 640 }, height: { ideal: 640 } }
            : { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 640 } },
          audio: false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => null);
        }

        // Lọc danh sách Camera vật lý duy nhất (loại bỏ bản sao 'default'/'communications' hoặc trùng groupId/label)
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        const rawCams = devices.filter(
          (d) => d.kind === 'videoinput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications'
        );
        const seenKeys = new Set();
        const uniqueCams = [];
        for (const cam of rawCams) {
          const cleanLabel = (cam.label || '').trim().toLowerCase();
          const dedupKey = cleanLabel || cam.groupId || cam.deviceId;
          if (!seenKeys.has(dedupKey)) {
            seenKeys.add(dedupKey);
            uniqueCams.push(cam);
          }
        }
        setVideoDevices(uniqueCams);

        const activeTrackDeviceId = stream.getVideoTracks()[0]?.getSettings?.()?.deviceId;
        if (!selectedDeviceId && activeTrackDeviceId && uniqueCams.some((c) => c.deviceId === activeTrackDeviceId)) {
          setSelectedDeviceId(activeTrackDeviceId);
        }

        setCameraStatusText('Đưa mã QR Vé điện tử vào khung ngắm xanh — Hệ thống sẽ TỰ ĐỘNG xác thực ngay khi nhận diện!');

        let detector = null;
        if ('BarcodeDetector' in window) {
          try {
            detector = new window.BarcodeDetector({ formats: ['qr_code'] });
          } catch (_) {
            detector = null;
          }
        }

        scanTimerRef.current = setInterval(async () => {
          const videoEl = videoRef.current;
          if (!videoEl || videoEl.readyState < 2 || isProcessingScanRef.current) return;

          // Cách 1: BarcodeDetector gốc của trình duyệt
          if (detector) {
            try {
              const barcodes = await detector.detect(videoEl);
              if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                handleQrDetected(barcodes[0].rawValue);
                return;
              }
            } catch (_) {
              // fallback sang canvas jsQR bên dưới
            }
          }

          // Cách 2: Phân tích frame trên Canvas bằng jsQR (hỗ trợ cả ảnh bị lật gương webcam laptop)
          const canvasEl = canvasRef.current;
          if (canvasEl && window.jsQR) {
            const w = videoEl.videoWidth || 480;
            const h = videoEl.videoHeight || 480;
            if (w > 0 && h > 0) {
              canvasEl.width = w;
              canvasEl.height = h;
              const ctx = canvasEl.getContext('2d', { willReadFrequently: true });
              if (ctx) {
                ctx.drawImage(videoEl, 0, 0, w, h);
                const imgData = ctx.getImageData(0, 0, w, h);
                const code = window.jsQR(imgData.data, w, h, { inversionAttempts: 'attemptBoth' });
                if (code && code.data) {
                  handleQrDetected(code.data);
                  return;
                }
                // Thử lật ngang ảnh phòng trường hợp webcam laptop bị mirror
                ctx.save();
                ctx.scale(-1, 1);
                ctx.drawImage(videoEl, -w, 0, w, h);
                ctx.restore();
                const mirroredData = ctx.getImageData(0, 0, w, h);
                const mirroredCode = window.jsQR(mirroredData.data, w, h, { inversionAttempts: 'attemptBoth' });
                if (mirroredCode && mirroredCode.data) {
                  handleQrDetected(mirroredCode.data);
                }
              }
            }
          }
        }, 220);
      } catch (err) {
        if (!cancelled) {
          setCameraError(
            `Không thể mở Camera thiết bị (${err.name || 'Lỗi quyền truy cập'}). Hãy cấp quyền Camera trên trình duyệt hoặc chọn ảnh QR từ máy.`
          );
        }
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      stopCameraStream();
    };
  }, [cameraOpen, selectedDeviceId]);

  const handleScanFromImageFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await ensureJsQrLoaded();

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = async () => {
      try {
        if ('BarcodeDetector' in window) {
          try {
            const det = new window.BarcodeDetector({ formats: ['qr_code'] });
            const res = await det.detect(img);
            if (res && res.length > 0 && res[0].rawValue) {
              URL.revokeObjectURL(objectUrl);
              await handleQrDetected(res[0].rawValue);
              return;
            }
          } catch (_) {
            // fallback sang jsQR
          }
        }
        const canvasEl = canvasRef.current;
        if (canvasEl && window.jsQR) {
          canvasEl.width = img.width;
          canvasEl.height = img.height;
          const ctx = canvasEl.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const imgData = ctx.getImageData(0, 0, img.width, img.height);
          const code = window.jsQR(imgData.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
          if (code && code.data) {
            URL.revokeObjectURL(objectUrl);
            await handleQrDetected(code.data);
            return;
          }
        }
        setCameraError('Không tìm thấy mã QR hợp lệ trong bức ảnh vừa chọn.');
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    img.src = objectUrl;
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {hasCheckinPermission && (
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{
                          padding: '0.35rem 0.75rem',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          color: '#1d4ed8',
                          borderColor: '#93c5fd',
                          background: '#eff6ff',
                        }}
                        onClick={() => setCameraOpen(true)}
                      >
                        📷 Mở Camera quét QR
                      </button>
                    )}
                    <span className={`badge ${hasCheckinPermission ? 'badge-APPROVED' : 'badge-REJECTED'}`}>
                      {hasCheckinPermission ? 'CHECKIN' : 'Bị khóa'}
                    </span>
                  </div>
                </div>

                {hasCheckinPermission ? (
                  <>
                    <form onSubmit={handleCheckin} style={{ marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input
                          type="text"
                          required
                          className="form-input mono"
                          placeholder="Dán chuỗi QR (tự động xác thực ngay) hoặc nhập mã TK-..."
                          value={ticketCodeInput}
                          onChange={(e) => setTicketCodeInput(e.target.value)}
                          onPaste={(e) => {
                            const pasted = e.clipboardData?.getData('text')?.trim();
                            if (pasted && pasted.includes('.')) {
                              e.preventDefault();
                              setTicketCodeInput(pasted);
                              performCheckin(pasted);
                            }
                          }}
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
                                          title="Quét và xác thực vé này ngay lập tức"
                                          onClick={() => performCheckin(a.qr_text)}
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

        {/* ==================== CỬA SỔ QUÉT MÃ QR BẰNG CAMERA THIẾT BỊ ==================== */}
        {cameraOpen && (
          <div
            onClick={() => setCameraOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.75)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1200,
              padding: '1rem',
            }}
          >
            <div
              className="card"
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: 500,
                width: '100%',
                margin: 0,
                padding: '1.25rem',
                borderRadius: 14,
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#2563eb', letterSpacing: '0.04em' }}>
                    LIVE CAMERA QR SCANNER
                  </div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0 }}>
                    Quét Mã QR Vé Điện Tử Bằng Camera
                  </h3>
                </div>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                  onClick={() => setCameraOpen(false)}
                >
                  ✕
                </button>
              </div>

              {/* Chỉ hiện menu chọn khi thiết bị thực sự có từ 2 Camera vật lý khác nhau trở lên */}
              {videoDevices.length > 1 && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <select
                    className="form-input"
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.6rem' }}
                    value={selectedDeviceId}
                    onChange={(e) => setSelectedDeviceId(e.target.value)}
                  >
                    {videoDevices.map((d, idx) => (
                      <option key={d.deviceId || idx} value={d.deviceId}>
                        {d.label || `Camera #${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Khung hiển thị Video Camera trực tiếp */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  height: 320,
                  background: '#0f172a',
                  borderRadius: 12,
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '0.75rem',
                  border: '2px solid #334155',
                }}
              >
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />

                {/* Khung ngắm định vị QR */}
                <div
                  style={{
                    position: 'absolute',
                    width: 210,
                    height: 210,
                    border: '2.5px solid #22c55e',
                    borderRadius: 14,
                    boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.42)',
                    pointerEvents: 'none',
                  }}
                />
              </div>

              <canvas ref={canvasRef} style={{ display: 'none' }} />

              {cameraError ? (
                <div
                  style={{
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#dc2626',
                    borderRadius: 8,
                    padding: '0.6rem 0.75rem',
                    fontSize: '0.8rem',
                    marginBottom: '0.75rem',
                  }}
                >
                  {cameraError}
                </div>
              ) : (
                <div style={{ fontSize: '0.8rem', color: '#475569', textAlign: 'center', marginBottom: '0.85rem' }}>
                  {cameraStatusText}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                <label
                  className="btn btn-outline"
                  style={{ flex: 1, textAlign: 'center', cursor: 'pointer', fontSize: '0.8rem', padding: '0.45rem 0.75rem' }}
                >
                  🖼️ Chọn ảnh QR từ máy
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleScanFromImageFile}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ padding: '0.45rem 1rem', fontSize: '0.8rem' }}
                  onClick={() => setCameraOpen(false)}
                >
                  Đóng Camera
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
