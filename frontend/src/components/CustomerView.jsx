import React, { useState, useEffect } from 'react';
import { api } from '../api';
import ToastNotification from './ToastNotification';

const cleanName = (val) => (val ? String(val).replace(/\s*\([^)]*\)/g, '').trim() : '');

export default function CustomerView({ user, onProfileUpdated, onLogout }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [tab, setTab] = useState('events'); // 'events' | 'bookings' | 'payments' | 'profile' | 'upgrade'

  // Public Events State
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [seatMap, setSeatMap] = useState([]);
  const [selectedTicketTypeId, setSelectedTicketTypeId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [validatedOrder, setValidatedOrder] = useState(null);

  // Booking Service State (Port 8003)
  const [myBookings, setMyBookings] = useState([]);
  const [seatStatus, setSeatStatus] = useState({ held: [], sold: [] });
  const [standingAvailability, setStandingAvailability] = useState([]);

  // Ticket Service State (Port 8005)
  const [myTickets, setMyTickets] = useState([]);
  const [transferModalTicket, setTransferModalTicket] = useState(null);
  const [transferToUserId, setTransferToUserId] = useState('');
  const [transferToOwnerName, setTransferToOwnerName] = useState('');
  const [transferringTicket, setTransferringTicket] = useState(false);

  // Payments State
  const [myPayments, setMyPayments] = useState([]);
  const [payLoading, setPayLoading] = useState(false);

  // Payment Modal Window State (Cửa sổ thanh toán VNPay & Giữ chỗ 10 phút)
  const [paymentModal, setPaymentModal] = useState(null);
  const [payRemainingSec, setPayRemainingSec] = useState(600);
  const [paymentSuccessData, setPaymentSuccessData] = useState(null);
  const [cancellingModalBooking, setCancellingModalBooking] = useState(false);

  // Xác định hạng vé đang chọn có phải là vé có ghế ngồi (SEATED) hay không
  const selectedTicketType = selectedEvent?.ticket_types?.find(
    (tt) => String(tt.id) === String(selectedTicketTypeId)
  );
  const selectedZone = seatMap?.find(
    (z) => z.id === selectedTicketType?.zone_id
  ) || selectedEvent?.zones?.find(
    (z) => z.id === selectedTicketType?.zone_id
  );
  const isSeatedTicket = selectedZone ? selectedZone.zone_type === 'SEATED' : false;

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

  const fetchMyBookings = async () => {
    try {
      const list = await api.getUserBookings(user.id);
      setMyBookings(list || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchMyTickets = async () => {
    try {
      // Đồng bộ phát hành vé tự động cho các đơn đã CONFIRMED nhưng chưa sinh vé
      const bookingsList = await api.getUserBookings(user.id).catch(() => myBookings);
      const confirmedList = (bookingsList || []).filter((b) => b.status === 'CONFIRMED');
      let ticketsList = await api.getUserTickets(user.id).catch(() => []);
      const existingBookingIds = new Set((ticketsList || []).map((t) => Number(t.booking_id)));
      const missingBookings = confirmedList.filter((b) => !existingBookingIds.has(Number(b.booking_id)));
      if (missingBookings.length > 0) {
        await Promise.all(
          missingBookings.map((b) =>
            api.ensureBookingTickets(b.booking_id, cleanName(user.full_name) || user.email).catch(() => null)
          )
        );
        ticketsList = await api.getUserTickets(user.id).catch(() => ticketsList);
      }
      setMyTickets(ticketsList || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleTransferTicket = async (e) => {
    e.preventDefault();
    if (!transferModalTicket || !transferToUserId.trim() || !transferToOwnerName.trim()) return;
    setTransferringTicket(true);
    setMsg({ text: '', type: '' });
    try {
      const res = await api.transferTicket(transferModalTicket.ticket_code, {
        from_user_id: String(user.id),
        to_user_id: transferToUserId.trim(),
        to_owner_name: transferToOwnerName.trim(),
      });
      setMsg({
        text: res.message || `Đã chuyển nhượng vé ${transferModalTicket.ticket_code} cho ${transferToOwnerName.trim()}. Mã QR cũ đã bị vô hiệu hóa!`,
        type: 'success',
      });
      setTransferModalTicket(null);
      setTransferToUserId('');
      setTransferToOwnerName('');
      await fetchMyTickets();
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
    } finally {
      setTransferringTicket(false);
    }
  };

  // Đếm ngược 10 phút giữ chỗ dựa trên mốc thời gian thực (Wall-clock Time)
  // Đảm bảo không bị tạm dừng/đóng băng khi người dùng ẩn trình duyệt hoặc đổi tab
  useEffect(() => {
    if (!paymentModal || paymentSuccessData) return;

    const targetTime = paymentModal.expiresAt || (Date.now() + payRemainingSec * 1000);

    const updateRemaining = () => {
      const now = Date.now();
      const diffSec = Math.max(0, Math.floor((targetTime - now) / 1000));
      setPayRemainingSec(diffSec);
    };

    updateRemaining();
    const timer = setInterval(updateRemaining, 1000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        updateRemaining();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
    };
  }, [paymentModal, paymentSuccessData]);

  const formatRemainingTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Tự động lắng nghe và cập nhật kết quả thanh toán từ VNPay theo thời gian thực
  // Lập tức kiểm tra lại khi người dùng quay lại tab từ cổng VNPay
  useEffect(() => {
    if (!paymentModal || paymentSuccessData) return;

    const checkPayment = async () => {
      try {
        const list = await api.getMyPayments();
        const currentPay = list?.find(
          (p) => p.payment_code === paymentModal.payment?.payment_code
        );
        if (currentPay && currentPay.status === 'SUCCESS') {
          setPaymentSuccessData(currentPay);
          setMsg({ text: 'Thanh toán VNPay thành công! Vé đã được phát hành.', type: 'success' });
          await Promise.all([fetchMyPayments(), fetchMyBookings()]);
          if (selectedEvent) {
            api.getEventSeatStatus(selectedEvent.id).then(setSeatStatus).catch(() => null);
          }
        }
      } catch {
        // Bỏ qua lỗi kết nối tạm thời khi polling
      }
    };

    const pollTimer = setInterval(checkPayment, 2500);

    const handleFocus = () => {
      if (document.visibilityState === 'visible') {
        checkPayment();
      }
    };
    document.addEventListener('visibilitychange', handleFocus);
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', handleFocus);
      window.removeEventListener('focus', handleFocus);
    };
  }, [paymentModal, paymentSuccessData, selectedEvent]);

  const handleSelectEvent = async (evId) => {
    setMsg({ text: '', type: '' });
    setSelectedSeats([]);
    setValidatedOrder(null);
    try {
      const [detail, mapData, statusData, standingData] = await Promise.all([
        api.getEventDetail(evId),
        api.getSeatMap(evId),
        api.getEventSeatStatus(evId).catch(() => ({ held: [], sold: [] })),
        api.getStandingAvailability(evId).catch(() => [])
      ]);
      setSelectedEvent(detail);
      setSeatMap(mapData?.zones || []);
      setSeatStatus(statusData || { held: [], sold: [] });
      setStandingAvailability(standingData || []);
      if (detail?.ticket_types?.length > 0) {
        const firstTt = detail.ticket_types[0];
        setSelectedTicketTypeId(firstTt.id);
        const zonesList = mapData?.zones || detail?.zones || [];
        const firstZone = zonesList.find((z) => z.id === firstTt.zone_id);
        if (firstZone?.zone_type === 'SEATED') {
          setQuantity(0);
        } else {
          setQuantity(1);
        }
      }
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
    }
  };

  const toggleSeatSelection = (zoneId, seatCode) => {
    setValidatedOrder(null);
    setMsg({ text: '', type: '' });

    const clickedZone = seatMap?.find((z) => z.id === zoneId) || selectedZone;
    const clickedSeat = clickedZone?.seats?.find((s) => s.seat_code === seatCode);

    // Nếu người dùng click vào ghế của khu vực khác với hạng vé đang chọn
    if (selectedZone && zoneId !== selectedZone.id) {
      const matchingTt = selectedEvent?.ticket_types?.find((tt) => tt.zone_id === zoneId);
      if (matchingTt) {
        setSelectedTicketTypeId(matchingTt.id);
        setSelectedSeats([seatCode]);
        setQuantity(1);
        return;
      }
    }

    // Tự động nhận diện và đồng bộ giữa Phân loại ghế (VIP / Thường) và Hạng vé tương ứng
    if (clickedSeat && selectedTicketType) {
      const ttNameUpper = (selectedTicketType.name || '').toUpperCase();
      const isVipTicket = ttNameUpper.includes('VIP');
      const isNormalTicket = !isVipTicket && (ttNameUpper.includes('THƯỜNG') || ttNameUpper.includes('STANDARD') || ttNameUpper.includes('TIÊU CHUẨN'));

      if (isVipTicket && clickedSeat.seat_tier !== 'VIP') {
        const normalTt = selectedEvent?.ticket_types?.find(
          (tt) => tt.zone_id === zoneId && !tt.name.toUpperCase().includes('VIP')
        );
        if (normalTt) {
          setSelectedTicketTypeId(normalTt.id);
          setSelectedSeats([seatCode]);
          setQuantity(1);
          setMsg({
            text: `Bạn vừa chọn ghế ${seatCode} (Ghế Thường). Hệ thống đã tự động chuyển sang hạng vé '${cleanName(normalTt.name)}'.`,
            type: 'info'
          });
          return;
        } else {
          setMsg({
            text: `Ghế ${seatCode} là Ghế Thường. Hạng vé bạn đang chọn là '${cleanName(selectedTicketType.name)}'. Vui lòng chọn ghế VIP ⭐ hoặc chuyển sang hạng vé Ghế Thường!`,
            type: 'error'
          });
          return;
        }
      }

      if (isNormalTicket && clickedSeat.seat_tier === 'VIP') {
        const vipTt = selectedEvent?.ticket_types?.find(
          (tt) => tt.zone_id === zoneId && tt.name.toUpperCase().includes('VIP')
        );
        if (vipTt) {
          setSelectedTicketTypeId(vipTt.id);
          setSelectedSeats([seatCode]);
          setQuantity(1);
          setMsg({
            text: `Bạn vừa chọn ghế ${seatCode} (Ghế VIP ⭐). Hệ thống đã tự động chuyển sang hạng vé '${cleanName(vipTt.name)}'.`,
            type: 'info'
          });
          return;
        } else {
          setMsg({
            text: `Ghế ${seatCode} là Ghế VIP ⭐. Hạng vé bạn đang chọn là '${cleanName(selectedTicketType.name)}'. Vui lòng chọn ghế Thường hoặc chuyển sang hạng vé VIP!`,
            type: 'error'
          });
          return;
        }
      }
    }

    if (selectedSeats.includes(seatCode)) {
      const next = selectedSeats.filter((s) => s !== seatCode);
      setSelectedSeats(next);
      setQuantity(next.length);
    } else {
      const maxAllowed = selectedTicketType?.max_per_order || 4;
      if (selectedSeats.length >= maxAllowed) {
        setMsg({ text: `Hạng vé này chỉ cho phép chọn tối đa ${maxAllowed} vé/đơn.`, type: 'error' });
        return;
      }
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

    // BẮT BUỘC CHỌN GHẾ NGỒI NẾU HẠNG VÉ THUỘC KHU VỰC CÓ GHẾ (SEATED)
    if (isSeatedTicket) {
      if (selectedSeats.length === 0) {
        setMsg({
          text: `Hạng vé '${cleanName(selectedTicketType?.name)}' là vé có ghế ngồi. Bạn bắt buộc phải click chọn vị trí ghế trên sơ đồ trước khi tiếp tục!`,
          type: 'error'
        });
        return;
      }
      if (selectedSeats.length !== Number(quantity)) {
        setMsg({
          text: `Số lượng vé (${quantity}) phải khớp chính xác với số ghế bạn đã chọn trên sơ đồ (${selectedSeats.length} ghế)!`,
          type: 'error'
        });
        return;
      }
    } else {
      if (Number(quantity) < 1) {
        setMsg({ text: 'Số lượng vé phải lớn hơn 0.', type: 'error' });
        return;
      }
    }

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
          text: `Đủ điều kiện đặt vé — ${isSeatedTicket ? `Đã chọn ${selectedSeats.length} ghế (${selectedSeats.join(', ')})` : `Số lượng: ${quantity} vé đứng`}. Tổng tiền: ${Number(res.total_price).toLocaleString('vi-VN')} đ.`,
          type: 'success'
        });
      }
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
    }
  };

  const handleCreateVNPayPayment = async () => {
    if (!selectedEvent || !validatedOrder) return;

    // Ràng buộc bảo vệ: Vé có ghế ngồi bắt buộc phải có ít nhất 1 ghế được chọn
    if (isSeatedTicket && selectedSeats.length === 0) {
      setMsg({
        text: `Hạng vé '${cleanName(selectedTicketType?.name)}' bắt buộc phải chọn vị trí ghế ngồi trước khi thanh toán!`,
        type: 'error'
      });
      return;
    }

    setPayLoading(true);
    setMsg({ text: '', type: '' });
    try {
      // 1. Giữ chỗ (Hold) trên Booking Service (Port 8003) trong 10 phút
      const unitPrice = validatedOrder.unit_price || (validatedOrder.total_price / quantity);
      let items = [];
      if (selectedSeats.length > 0) {
        items = selectedSeats.map((seatCode) => ({
          ticket_type_id: String(selectedTicketTypeId),
          seat_id: seatCode,
          quantity: 1,
          unit_price: unitPrice
        }));
      } else {
        items = [{
          ticket_type_id: String(selectedTicketTypeId),
          seat_id: null,
          quantity: quantity,
          unit_price: unitPrice
        }];
      }

      const holdRes = await api.holdBooking({
        event_id: String(selectedEvent.id),
        user_id: String(user.id),
        items: items
      });

      const bookingId = holdRes.booking_id;
      const idempotencyKey = `idem-user${user.id}-bk${bookingId}-${Date.now()}`;

      // 2. Tạo phiên thanh toán VNPay liên kết mã đơn thực tế từ Booking Service
      const payment = await api.createPayment({
        booking_id: bookingId,
        amount: holdRes.total_amount,
        payment_method: 'VNPAY_SANDBOX',
        idempotency_key: idempotencyKey,
        order_desc: `Thanh toan don giu cho ${bookingId} - ${validatedOrder.quantity}x ${cleanName(validatedOrder.ticket_type_name)}`,
        bank_code: 'NCB'
      });

      // 3. Mở Cửa sổ Thanh toán (Payment Modal) trực tiếp để khách hàng thao tác
      const expireTimestamp = holdRes.expires_at ? new Date(holdRes.expires_at).getTime() : Date.now() + 600 * 1000;
      const initialRemaining = Math.max(0, Math.floor((expireTimestamp - Date.now()) / 1000));
      setPayRemainingSec(initialRemaining);
      setPaymentSuccessData(null);
      setPaymentModal({
        payment: payment,
        bookingId: bookingId,
        expiresAt: expireTimestamp,
        eventTitle: selectedEvent.title,
        venueName: `${selectedEvent.venue_name} — ${selectedEvent.venue_address || ''}`,
        ticketTypeName: selectedTicketType?.name || validatedOrder.ticket_type_name,
        seats: [...selectedSeats],
        quantity: quantity,
        totalAmount: holdRes.total_amount,
        unitPrice: unitPrice
      });

      setMsg({
        text: `Đã giữ chỗ thành công đơn #${bookingId} (10 phút). Vui lòng hoàn tất thanh toán trong cửa sổ bên dưới.`,
        type: 'success'
      });
      await Promise.all([fetchMyPayments(), fetchMyBookings()]);
      if (selectedEvent) {
        api.getEventSeatStatus(selectedEvent.id).then(setSeatStatus).catch(() => null);
      }
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
    } finally {
      setPayLoading(false);
    }
  };

  // Hủy giữ chỗ từ Cửa sổ Thanh toán
  const handleCancelBookingFromModal = async () => {
    if (!paymentModal) return;
    if (!window.confirm('Bạn có chắc chắn muốn hủy đơn giữ chỗ này? Chỗ ngồi sẽ được trả lại cho khách hàng khác.')) return;
    setCancellingModalBooking(true);
    setMsg({ text: '', type: '' });
    try {
      await api.cancelBooking(paymentModal.bookingId, user.id);
      setPaymentModal(null);
      setPaymentSuccessData(null);
      setMsg({ text: 'Đã hủy đơn giữ chỗ. Ghế đã được hoàn trả lại kho.', type: 'success' });
      await Promise.all([fetchMyBookings(), fetchMyPayments()]);
      if (selectedEvent) {
        api.getEventSeatStatus(selectedEvent.id).then(setSeatStatus).catch(() => null);
      }
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
    } finally {
      setCancellingModalBooking(false);
    }
  };

  // Mở lại Cửa sổ Thanh toán từ Danh sách Đơn giữ chỗ
  const handleOpenPaymentModalForBooking = (b) => {
    const payment = myPayments.find((p) => Number(p.booking_id) === Number(b.booking_id));
    if (!payment) {
      setTab('payments');
      fetchMyPayments();
      return;
    }
    const seats = (b.items || []).filter((it) => it.seat_id).map((it) => it.seat_id);
    const qty = (b.items || []).reduce((acc, it) => acc + (it.quantity || 1), 0);
    const expTime = new Date(b.expires_at).getTime();
    const remaining = Math.max(0, Math.floor((expTime - Date.now()) / 1000));

    setPayRemainingSec(remaining);
    setPaymentSuccessData(null);
    setPaymentModal({
      payment: payment,
      bookingId: b.booking_id,
      expiresAt: expTime,
      eventTitle: `Sự kiện #${b.event_id}`,
      venueName: 'Địa điểm tổ chức sự kiện',
      ticketTypeName: (b.items && b.items[0]?.seat_id) ? 'Vé Ghế ngồi' : 'Vé Đứng Fanzone',
      seats: seats,
      quantity: qty,
      totalAmount: b.total_amount,
      unitPrice: b.items && b.items[0] ? b.items[0].unit_price : 0
    });
  };

  const handleCancelBooking = async (bookingId) => {
    if (!window.confirm(`Bạn có chắc chắn muốn hủy đơn giữ chỗ #${bookingId}? Ghế sẽ được hoàn trả cho người khác.`)) return;
    setMsg({ text: '', type: '' });
    try {
      await api.cancelBooking(bookingId, user.id);
      setMsg({ text: `Đã hủy đơn giữ chỗ #${bookingId}. Ghế đã được trả lại kho.`, type: 'success' });
      await Promise.all([fetchMyBookings(), fetchMyPayments()]);
      if (selectedEvent) {
        const statusData = await api.getEventSeatStatus(selectedEvent.id).catch(() => null);
        if (statusData) setSeatStatus(statusData);
      }
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
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
      await Promise.all([fetchMyPayments(), fetchMyBookings()]);
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
      await Promise.all([fetchMyPayments(), fetchMyBookings()]);
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
    }
  };

  useEffect(() => {
    fetchProfile();
    fetchPublicEvents();
    fetchMyPayments();
    fetchMyBookings();
    fetchMyTickets();

    const params = new URLSearchParams(window.location.search);
    const vnpayStatus = params.get('vnpay_status');
    const payCode = params.get('payment_code');
    if (vnpayStatus) {
      window.history.replaceState({}, '', window.location.pathname);
      if (vnpayStatus === 'success') {
        setTab('tickets');
        setMsg({
          text: `Thanh toán VNPay thành công${payCode ? ` (Mã GD: ${payCode})` : ''}! Vé điện tử QR của bạn đã được phát hành.`,
          type: 'success',
        });
      } else {
        setTab('bookings');
        setMsg({
          text: 'Giao dịch thanh toán VNPay không thành công hoặc đã bị hủy.',
          type: 'error',
        });
      }
    }
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
              className={`portal-switch-btn ${tab === 'bookings' ? 'active' : ''}`}
              onClick={() => {
                setTab('bookings');
                fetchMyBookings();
                fetchMyPayments();
              }}
            >
              Đơn giữ chỗ
            </button>
            <button
              type="button"
              className={`portal-switch-btn ${tab === 'tickets' ? 'active' : ''}`}
              onClick={() => {
                setTab('tickets');
                fetchMyTickets();
              }}
            >
              Vé QR của tôi ({myTickets.length})
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
                      <td>
                        {(() => {
                          const now = Date.now();
                          const sMs = ev.start_time ? new Date(ev.start_time).getTime() : 0;
                          const eMs = ev.end_time ? new Date(ev.end_time).getTime() : 0;
                          let label = 'Công bố';
                          let cls = 'badge-APPROVED';
                          if (ev.status === 'CANCELLED') {
                            label = 'Đang hủy';
                            cls = 'badge-REJECTED';
                          } else if (ev.status === 'COMPLETED' || (eMs && now > eMs)) {
                            label = 'Đã kết thúc';
                            cls = 'badge-PENDING';
                          } else if (ev.status === 'HAPPENING' || (sMs && eMs && now >= sMs && now <= eMs)) {
                            label = 'Đang diễn ra';
                            cls = 'badge-PENDING';
                          }
                          return <span className={`badge ${cls}`}>{label}</span>;
                        })()}
                      </td>
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

            {/* Chú thích màu sắc: Phân biệt rõ Ghế VIP, Ghế Thường và Trạng thái ghế (Chỉ hiện khi có phân khu ghế ngồi) */}
            {seatMap.some((z) => z.zone_type === 'SEATED') && (
              <div style={{ display: 'flex', gap: '0.9rem', flexWrap: 'wrap', fontSize: '0.75rem', marginBottom: '1rem', alignItems: 'center', background: '#fff', padding: '0.65rem 0.9rem', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ width: 15, height: 15, background: '#fffbeb', border: '1.5px solid #f59e0b', borderRadius: 3, display: 'inline-block' }}></span>
                  <span style={{ color: '#b45309', fontWeight: 700 }}>Ghế VIP ⭐</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ width: 15, height: 15, background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 3, display: 'inline-block' }}></span>
                  <span style={{ color: '#334155', fontWeight: 600 }}>Ghế Thường</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ width: 15, height: 15, background: '#2563eb', borderRadius: 3, display: 'inline-block' }}></span>
                  <span style={{ color: '#2563eb', fontWeight: 600 }}>Đang chọn</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ width: 15, height: 15, background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 3, display: 'inline-block' }}></span>
                  <span style={{ color: '#d97706', fontWeight: 600 }}>Đang giữ chỗ</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ width: 15, height: 15, background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 3, display: 'inline-block' }}></span>
                  <span style={{ color: '#dc2626', fontWeight: 600 }}>Đã bán</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ width: 15, height: 15, background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 3, display: 'inline-block' }}></span>
                  <span style={{ color: '#94a3b8' }}>Bị khóa</span>
                </div>
              </div>
            )}

            {seatMap.map((zone) => {
              const isCurrentZone = zone.id === selectedTicketType?.zone_id;
              return (
                <div
                  key={zone.id}
                  style={{
                    padding: '1rem',
                    border: isCurrentZone ? '2px solid #2563eb' : '1px solid var(--border)',
                    borderRadius: 8,
                    marginBottom: '1rem',
                    background: isCurrentZone ? '#f8faff' : 'var(--bg-page)',
                    boxShadow: isCurrentZone ? '0 0 0 1px #2563eb' : 'none'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem', fontSize: '0.84rem', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <strong>{cleanName(zone.name)}</strong>
                      {isCurrentZone && (
                        <span style={{ fontSize: '0.72rem', background: '#2563eb', color: '#fff', padding: '0.15rem 0.5rem', borderRadius: 4, fontWeight: 600 }}>
                          Khu vực vé đang chọn
                        </span>
                      )}
                    </div>
                    <span>Sức chứa: {zone.total_capacity} ({zone.zone_type === 'SEATED' ? 'Ghế ngồi' : 'Vé đứng'})</span>
                  </div>

                  {zone.zone_type === 'SEATED' && (
                    (!zone.seats || zone.seats.length === 0) ? (
                      <div style={{ padding: '1.25rem', textAlign: 'center', background: '#fff', borderRadius: 8, border: '1px dashed #cbd5e1', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        ⚠️ Khu vực này đang được Ban tổ chức cập nhật sơ đồ ghế.
                      </div>
                    ) : (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: `repeat(${zone.grid_cols || 10}, minmax(42px, 1fr))`,
                          gap: '0.35rem'
                        }}
                      >
                        {zone.seats.map((seat) => {
                        const isHeld = seatStatus.held?.includes(seat.seat_code);
                        const isSold = seatStatus.sold?.includes(seat.seat_code);
                        const isUnavailable = seat.is_disabled || isHeld || isSold;
                        const isSelected = selectedSeats.includes(seat.seat_code);
                        const isVip = seat.seat_tier === 'VIP';

                        let bg = isVip ? '#fffbeb' : '#ffffff';
                        let color = isVip ? '#b45309' : '#334155';
                        let border = isVip ? '1.5px solid #f59e0b' : '1px solid #cbd5e1';
                        let badgeText = isVip ? 'VIP' : 'Thường';
                        let badgeColor = isVip ? '#b45309' : '#64748b';
                        let title = `Ghế ${seat.seat_code} [${isVip ? 'Hạng VIP ⭐' : 'Hạng Thường'}] - Có thể chọn`;

                        if (seat.is_disabled) {
                          bg = '#f1f5f9';
                          color = '#94a3b8';
                          border = '1px solid #cbd5e1';
                          badgeText = 'Khóa';
                          badgeColor = '#94a3b8';
                          title = `Ghế ${seat.seat_code} - Bị khóa`;
                        } else if (isSold) {
                          bg = '#fee2e2';
                          color = '#dc2626';
                          border = '1px solid #fca5a5';
                          badgeText = 'Đã bán';
                          badgeColor = '#dc2626';
                          title = `Ghế ${seat.seat_code} - Đã bán`;
                        } else if (isHeld) {
                          bg = '#fef3c7';
                          color = '#d97706';
                          border = '1px solid #fcd34d';
                          badgeText = 'Giữ chỗ';
                          badgeColor = '#d97706';
                          title = `Ghế ${seat.seat_code} - Đang giữ chỗ`;
                        } else if (isSelected) {
                          bg = '#2563eb';
                          color = '#ffffff';
                          border = '1.5px solid #1d4ed8';
                          badgeText = '✓ Chọn';
                          badgeColor = '#ffffff';
                          title = `Ghế ${seat.seat_code} - Đang chọn`;
                        }

                        return (
                          <button
                            key={seat.id}
                            type="button"
                            disabled={isUnavailable}
                            onClick={() => toggleSeatSelection(zone.id, seat.seat_code)}
                            title={title}
                            style={{
                              padding: '0.35rem 0.15rem',
                              borderRadius: 6,
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              cursor: isUnavailable ? 'not-allowed' : 'pointer',
                              background: bg,
                              color: color,
                              border: border,
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              minHeight: '44px',
                              boxShadow: isVip && !isUnavailable && !isSelected ? '0 1px 3px rgba(245, 158, 11, 0.2)' : 'none',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <span>{seat.seat_code}</span>
                            <span style={{ fontSize: '0.58rem', fontWeight: isVip || isSelected ? 800 : 500, color: badgeColor, marginTop: 1 }}>
                              {badgeText}
                            </span>
                          </button>
                        );
                      })}
                      </div>
                    )
                  )}

                  {zone.zone_type !== 'SEATED' && (() => {
                    const zoneTicketTypes = selectedEvent?.ticket_types?.filter((tt) => tt.zone_id === zone.id) || [];
                    let available = zone.total_capacity;
                    let occupied = 0;
                    if (standingAvailability?.length > 0) {
                      const matched = standingAvailability.filter((sa) =>
                        zoneTicketTypes.some((tt) => String(tt.id) === String(sa.ticket_type_id))
                      );
                      if (matched.length > 0) {
                        available = matched.reduce((acc, curr) => acc + curr.available, 0);
                        occupied = Math.max(0, zone.total_capacity - available);
                      }
                    }
                    const percent = Math.min(100, Math.round((occupied / (zone.total_capacity || 1)) * 100));

                    return (
                      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1.25rem', marginTop: '0.4rem' }}>
                        {/* 3 Thẻ thống kê sức chứa */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.85rem', marginBottom: '1.15rem' }}>
                          <div style={{ padding: '0.85rem 1rem', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>TỔNG SỨC CHỨA KHU VỰC</div>
                            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
                              {Number(zone.total_capacity).toLocaleString('vi-VN')} <span style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-muted)' }}>chỗ</span>
                            </div>
                          </div>
                          <div style={{ padding: '0.85rem 1rem', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
                            <div style={{ fontSize: '0.72rem', color: '#166534', fontWeight: 600 }}>SỨC CHỨA CÒN TRỐNG</div>
                            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#15803d', marginTop: 2 }}>
                              {Number(available).toLocaleString('vi-VN')} <span style={{ fontSize: '0.78rem', fontWeight: 500, color: '#166534' }}>vé</span>
                            </div>
                          </div>
                          <div style={{ padding: '0.85rem 1rem', background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
                            <div style={{ fontSize: '0.72rem', color: '#1e40af', fontWeight: 600 }}>TỶ LỆ LẤP ĐẦY HIỆN TẠI</div>
                            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#2563eb', marginTop: 2 }}>
                              {percent}%
                            </div>
                          </div>
                        </div>

                        {/* Thanh đo sức chứa trực quan (Capacity Progress Bar) */}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '0.45rem', fontWeight: 600 }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <span>📊 Tiến độ lấp đầy sức chứa:</span>
                              <span style={{ color: percent > 85 ? '#dc2626' : '#2563eb' }}>
                                Đã giữ / bán: {Number(occupied).toLocaleString('vi-VN')} / {Number(zone.total_capacity).toLocaleString('vi-VN')} chỗ ({percent}%)
                              </span>
                            </span>
                            <span style={{ color: available > 0 ? '#15803d' : '#dc2626' }}>
                              {available > 0 ? `Còn ${available} vé` : 'Hết vé'}
                            </span>
                          </div>
                          <div style={{ width: '100%', height: 16, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden', padding: 2 }}>
                            <div
                              style={{
                                width: `${Math.max(2, percent)}%`,
                                height: '100%',
                                background: percent > 85
                                  ? 'linear-gradient(90deg, #f59e0b, #ef4444)'
                                  : 'linear-gradient(90deg, #3b82f6, #2563eb)',
                                borderRadius: 99,
                                transition: 'width 0.4s ease'
                              }}
                            />
                          </div>
                        </div>

                        {/* Diễn giải vé đứng tự do */}
                        <div style={{ marginTop: '1rem', paddingTop: '0.85rem', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem', fontSize: '0.8rem' }}>
                          <div style={{ color: 'var(--text-secondary)' }}>
                            🏃 <strong>Khu vực vé đứng tự do (Standing / Fanzone):</strong> <em>Vé không phân chia số ghế. Khách hàng vào cửa tự do và đứng xem trong phạm vi khu vực này.</em>
                          </div>
                          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                            {zoneTicketTypes.map((tt) => (
                              <span key={tt.id} style={{ background: '#f1f5f9', padding: '0.2rem 0.55rem', borderRadius: 4, fontSize: '0.74rem', fontWeight: 600, color: '#334155', border: '1px solid #e2e8f0' }}>
                                {cleanName(tt.name)}: {Number(tt.current_price || 0).toLocaleString('vi-VN')} đ
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })}

            {selectedEvent.ticket_types?.length > 0 && (
              <form onSubmit={handleValidateTicket} style={{ padding: '1rem', background: 'var(--bg-page)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 120px auto auto', gap: '0.75rem', alignItems: 'end' }}>
                  <div>
                    <label className="form-label">Hạng vé</label>
                    <select
                      className="form-input"
                      value={selectedTicketTypeId}
                      onChange={(e) => {
                        const newTypeId = e.target.value;
                        setSelectedTicketTypeId(newTypeId);
                        setSelectedSeats([]);
                        setValidatedOrder(null);
                        const newTt = selectedEvent?.ticket_types?.find((tt) => String(tt.id) === String(newTypeId));
                        const newZone = seatMap?.find((z) => z.id === newTt?.zone_id) || selectedEvent?.zones?.find((z) => z.id === newTt?.zone_id);
                        if (newZone?.zone_type === 'SEATED') {
                          setQuantity(0);
                        } else {
                          setQuantity(1);
                        }
                      }}
                    >
                      {selectedEvent.ticket_types.map((tt) => {
                        const z = seatMap?.find((item) => item.id === tt.zone_id) || selectedEvent?.zones?.find((item) => item.id === tt.zone_id);
                        const isSeated = z?.zone_type === 'SEATED';
                        return (
                          <option key={tt.id} value={tt.id}>
                            {cleanName(tt.name)} [{isSeated ? 'Ghế ngồi' : 'Vé đứng'}] — {Number(tt.current_price || 0).toLocaleString('vi-VN')} đ
                            {tt.student_email_domain ? ` • Yêu cầu ${tt.student_email_domain}` : ''}
                          </option>
                        );
                      })}
                    </select>
                    {selectedTicketType && (selectedTicketType.sale_start_time || selectedTicketType.sale_end_time) && (
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 4 }}>
                        ⏰ Mở bán: {new Date(selectedTicketType.sale_start_time || selectedTicketType.created_at).toLocaleString('vi-VN')} → {new Date(selectedTicketType.sale_end_time || selectedEvent.start_time).toLocaleString('vi-VN')}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="form-label">
                      Số lượng {isSeatedTicket && <span style={{ color: '#2563eb', fontSize: '0.75rem' }}>(Tự động)</span>}
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={selectedTicketType?.max_per_order || 4}
                      className="form-input"
                      value={quantity}
                      readOnly={isSeatedTicket}
                      style={isSeatedTicket ? { background: '#f1f5f9', cursor: 'not-allowed' } : {}}
                      onChange={(e) => {
                        if (!isSeatedTicket) {
                          setQuantity(Math.max(1, Number(e.target.value)));
                          setValidatedOrder(null);
                        }
                      }}
                    />
                  </div>
                  <button
                    type="submit"
                    className="btn btn-outline"
                    disabled={isSeatedTicket && selectedSeats.length === 0}
                    style={isSeatedTicket && selectedSeats.length === 0 ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
                    title={isSeatedTicket && selectedSeats.length === 0 ? "Vui lòng chọn ghế trên sơ đồ trước" : ""}
                  >
                    Kiểm tra giá vé
                  </button>
                  {validatedOrder && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={payLoading}
                      onClick={handleCreateVNPayPayment}
                    >
                      {payLoading ? 'Đang giữ chỗ...' : 'Giữ chỗ & Thanh toán VNPay →'}
                    </button>
                  )}
                </div>

                {isSeatedTicket && selectedSeats.length > 0 && (
                  <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.85rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, color: '#15803d', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <span>✓</span>
                    <span>Đã chọn <strong>{selectedSeats.length}</strong> ghế: <strong>{selectedSeats.join(', ')}</strong> (Khu vực: {cleanName(selectedZone?.name)})</span>
                  </div>
                )}
              </form>
            )}
          </div>
        )}

        {tab === 'bookings' && (
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span className="card-title">Danh sách Đơn giữ chỗ (Booking Service - Cổng 8003)</span>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  Mỗi đơn giữ chỗ có hiệu lực trong 10 phút. Nếu không thanh toán kịp, ghế/vé sẽ được tự động giải phóng.
                </div>
              </div>
              <button
                type="button"
                className="btn btn-outline"
                style={{ padding: '0.3rem 0.7rem', fontSize: '0.78rem' }}
                onClick={() => {
                  fetchMyBookings();
                  fetchMyPayments();
                }}
              >
                ↻ Làm mới
              </button>
            </div>

            <table className="data-table">
              <thead>
                <tr>
                  <th>Mã đơn</th>
                  <th>Sự kiện</th>
                  <th>Chi tiết vé</th>
                  <th>Tổng tiền</th>
                  <th>Thời gian</th>
                  <th>Trạng thái</th>
                  <th style={{ textAlign: 'right' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {myBookings.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                      Chưa có đơn đặt giữ chỗ nào.
                    </td>
                  </tr>
                ) : (
                  myBookings.map((b) => {
                    const relatedPayment = myPayments.find((p) => Number(p.booking_id) === Number(b.booking_id));
                    const isPaymentSuccess = relatedPayment?.status === 'SUCCESS';
                    const isConfirmed = b.status === 'CONFIRMED' || isPaymentSuccess;
                    const isExpired = !isConfirmed && (b.status === 'EXPIRED' || (b.status === 'PENDING_PAYMENT' && new Date(b.expires_at).getTime() <= Date.now()));
                    const isCancelled = !isConfirmed && !isExpired && b.status === 'CANCELLED';
                    const isPending = !isConfirmed && !isExpired && !isCancelled;
                    const badgeClass = isConfirmed ? 'badge-APPROVED' : isPending ? 'badge-PENDING' : 'badge-REJECTED';
                    const statusLabel = isConfirmed ? 'ĐÃ THANH TOÁN' : isPending ? 'ĐANG GIỮ CHỖ' : isExpired ? 'HẾT HẠN' : 'ĐÃ HỦY';

                    return (
                      <tr key={b.booking_id}>
                        <td className="mono"><strong>#{b.booking_id}</strong></td>
                        <td>Sự kiện #{b.event_id}</td>
                        <td style={{ fontSize: '0.8rem' }}>
                          {(b.items || []).map((it, idx) => (
                            <div key={idx}>
                              • {it.seat_id ? `Ghế ${it.seat_id}` : `Vé đứng`} (Hạng {it.ticket_type_id}): {it.quantity}x {Number(it.unit_price).toLocaleString('vi-VN')} đ
                            </div>
                          ))}
                        </td>
                        <td><strong>{Number(b.total_amount).toLocaleString('vi-VN')} đ</strong></td>
                        <td style={{ fontSize: '0.78rem' }}>
                          <div>Tạo: {new Date(b.created_at).toLocaleString('vi-VN')}</div>
                          <div style={{ color: isPending ? '#d97706' : 'var(--text-muted)', fontWeight: isPending ? 600 : 400 }}>
                            Hết hạn: {new Date(b.expires_at).toLocaleString('vi-VN')}
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${badgeClass}`}>{statusLabel}</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {isPending && (
                            <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                              <button
                                type="button"
                                className="btn btn-outline"
                                style={{ padding: '0.28rem 0.65rem', fontSize: '0.76rem', color: '#dc2626', borderColor: '#fca5a5' }}
                                onClick={() => handleCancelBooking(b.booking_id)}
                              >
                                Hủy chỗ
                              </button>
                              <button
                                type="button"
                                className="btn btn-primary"
                                style={{ padding: '0.28rem 0.65rem', fontSize: '0.76rem' }}
                                onClick={() => handleOpenPaymentModalForBooking(b)}
                              >
                                Thanh toán →
                              </button>
                            </div>
                          )}
                          {isConfirmed && (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ fontSize: '0.78rem', color: 'var(--success)', fontWeight: 600 }}>
                                ✓ Đã thanh toán
                              </span>
                              <button
                                type="button"
                                className="btn btn-outline"
                                style={{ padding: '0.24rem 0.6rem', fontSize: '0.74rem' }}
                                onClick={() => {
                                  setTab('tickets');
                                  fetchMyTickets();
                                }}
                              >
                                🎟️ Vé QR
                              </button>
                            </div>
                          )}
                          {isExpired && (
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                              Đã trả lại kho
                            </span>
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

        {tab === 'tickets' && (
          <div className="card">
            <div className="card-header">
              <div>
                <span className="card-title">Vé điện tử QR của tôi (Ticket Service - Cổng 8005)</span>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  Mỗi vé được gắn chữ ký số chống giả HMAC-SHA256. Khi sang nhượng vé, mã QR cũ tự động vô hiệu hóa.
                </div>
              </div>
              <button
                type="button"
                className="btn btn-outline"
                style={{ padding: '0.3rem 0.7rem', fontSize: '0.78rem' }}
                onClick={fetchMyTickets}
              >
                ↻ Làm mới
              </button>
            </div>

            {myTickets.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2.5rem' }}>
                Chưa có vé điện tử nào được phát hành. Hãy đặt vé và hoàn tất thanh toán để nhận vé QR!
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
                {myTickets.map((t) => {
                  const isIssued = t.status === 'ISSUED';
                  const isCheckedIn = t.status === 'CHECKED_IN';
                  const isCancelled = t.status === 'CANCELLED';
                  const badgeClass = isIssued ? 'badge-APPROVED' : isCheckedIn ? 'badge-PENDING' : 'badge-REJECTED';
                  const statusLabel = isIssued ? 'HỢP LỆ (CHƯA QUA CỔNG)' : isCheckedIn ? 'ĐÃ CHECK-IN' : 'ĐÃ HỦY';
                  const evObj = events.find((e) => String(e.id) === String(t.event_id));

                  return (
                    <div
                      key={t.ticket_code}
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        padding: '1rem',
                        background: isCancelled ? '#f8fafc' : '#fff',
                        opacity: isCancelled ? 0.75 : 1,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                        <div>
                          <div className="mono" style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b' }}>
                            {t.ticket_code}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            {evObj ? evObj.title : `Sự kiện #${t.event_id}`} • Đơn #{t.booking_id}
                          </div>
                        </div>
                        <span className={`badge ${badgeClass}`}>{statusLabel}</span>
                      </div>

                      <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'center' }}>
                        <div
                          style={{
                            width: 112,
                            height: 112,
                            border: '1px solid #e2e8f0',
                            borderRadius: 8,
                            padding: 4,
                            background: '#fff',
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <img
                            src={api.getTicketQrUrl(t.ticket_code, t.qr_version)}
                            alt={t.ticket_code}
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                          />
                        </div>

                        <div style={{ fontSize: '0.8rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.28rem' }}>
                          <div>
                            <span style={{ color: 'var(--text-muted)' }}>Chủ vé: </span>
                            <strong>{t.owner_name}</strong>
                          </div>
                          <div>
                            <span style={{ color: 'var(--text-muted)' }}>Vị trí: </span>
                            <strong>{t.seat_id ? `Ghế ${t.seat_id}` : 'Vé đứng'}</strong> (Hạng #{t.ticket_type_id})
                          </div>
                          <div>
                            <span style={{ color: 'var(--text-muted)' }}>Phiên bản QR: </span>
                            <span className="mono">v{t.qr_version}</span>
                          </div>
                          <div>
                            <span style={{ color: 'var(--text-muted)' }}>Phát hành: </span>
                            <span>{t.issued_at ? new Date(t.issued_at).toLocaleString('vi-VN') : '-'}</span>
                          </div>
                          {isCheckedIn && t.checked_in_at && (
                            <div style={{ color: '#16a34a', fontWeight: 600 }}>
                              ✓ Vào cổng: {new Date(t.checked_in_at).toLocaleString('vi-VN')}
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ background: '#f8fafc', padding: '0.45rem 0.6rem', borderRadius: 6, border: '1px dashed #cbd5e1' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 2 }}>
                          Chuỗi QR ký số (Dùng để quét tại cổng Check-in):
                        </div>
                        <div
                          className="mono"
                          style={{
                            fontSize: '0.7rem',
                            wordBreak: 'break-all',
                            maxHeight: 36,
                            overflow: 'hidden',
                            color: '#334155',
                          }}
                        >
                          {t.qr_text}
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginTop: 'auto' }}>
                        <button
                          type="button"
                          className="btn btn-outline"
                          style={{ padding: '0.32rem 0.65rem', fontSize: '0.76rem', flex: 1 }}
                          onClick={() => {
                            navigator.clipboard?.writeText(t.qr_text);
                            setMsg({ text: `Đã sao chép chuỗi QR ký số của vé ${t.ticket_code}.`, type: 'success' });
                          }}
                        >
                          📋 Copy chuỗi QR
                        </button>
                        {isIssued && (
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ padding: '0.32rem 0.65rem', fontSize: '0.76rem', flex: 1 }}
                            onClick={() => {
                              setTransferModalTicket(t);
                              setTransferToUserId('');
                              setTransferToOwnerName('');
                            }}
                          >
                            ⇄ Sang nhượng vé
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {transferModalTicket && (
              <div
                style={{
                  position: 'fixed',
                  inset: 0,
                  background: 'rgba(15, 23, 42, 0.55)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 1100,
                  padding: '1rem',
                }}
              >
                <div className="card" style={{ maxWidth: 440, width: '100%', margin: 0 }}>
                  <div className="card-header">
                    <span className="card-title">Sang nhượng vé {transferModalTicket.ticket_code}</span>
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ padding: '0.2rem 0.55rem', fontSize: '0.75rem' }}
                      onClick={() => setTransferModalTicket(null)}
                    >
                      ✕
                    </button>
                  </div>
                  <form onSubmit={handleTransferTicket}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.85rem' }}>
                      Lưu ý: Sau khi chuyển nhượng, <strong>mã QR hiện tại (v{transferModalTicket.qr_version}) sẽ bị vô hiệu hóa ngay lập tức</strong> và hệ thống sẽ cấp mã QR mới (v{transferModalTicket.qr_version + 1}) cho người nhận.
                    </div>
                    <div className="form-group">
                      <label className="form-label">ID tài khoản người nhận (User ID)</label>
                      <input
                        type="text"
                        required
                        className="form-input"
                        placeholder="VD: 2 hoặc ID người nhận..."
                        value={transferToUserId}
                        onChange={(e) => setTransferToUserId(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Họ và tên người nhận in trên vé</label>
                      <input
                        type="text"
                        required
                        className="form-input"
                        placeholder="Nhập họ tên người nhận..."
                        value={transferToOwnerName}
                        onChange={(e) => setTransferToOwnerName(e.target.value)}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => setTransferModalTicket(null)}
                      >
                        Hủy
                      </button>
                      <button type="submit" className="btn btn-primary" disabled={transferringTicket}>
                        {transferringTicket ? 'Đang chuyển...' : 'Xác nhận chuyển vé'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'payments' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">Lịch sử Giao dịch VNPay</span>
            </div>

            <table className="data-table">
              <thead>
                <tr>
                  <th>Mã giao dịch</th>
                  <th>Đơn hàng</th>
                  <th>Thời gian</th>
                  <th>Số tiền</th>
                  <th>Trạng thái</th>
                  <th>Hoàn tiền</th>
                  <th style={{ textAlign: 'right' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {myPayments.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                      Chưa có giao dịch thanh toán nào.
                    </td>
                  </tr>
                ) : (
                  myPayments.map((p) => {
                    const refundedTotal = (p.refunds || []).reduce((acc, r) => acc + Number(r.refund_amount || 0), 0);
                    const relatedBooking = myBookings.find((b) => Number(b.booking_id) === Number(p.booking_id));
                    const isBookingExpired = relatedBooking ? (relatedBooking.status === 'EXPIRED' || relatedBooking.status === 'CANCELLED') : false;
                    const isTimeExpired = p.created_at && (Date.now() - new Date(p.created_at).getTime()) > 10 * 60 * 1000;
                    const isExpired = p.status === 'EXPIRED' || (p.status === 'PENDING' && (isBookingExpired || isTimeExpired));

                    return (
                      <tr key={p.id}>
                        <td className="mono">
                          <strong>{p.payment_code}</strong>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            {p.payment_method}
                          </div>
                        </td>
                        <td className="mono">Đơn #{p.booking_id}</td>
                        <td style={{ fontSize: '0.78rem' }}>
                          <div>Tạo đơn: {new Date(p.created_at).toLocaleString('vi-VN')}</div>
                          {p.paid_at && (
                            <div style={{ color: 'var(--success)', fontWeight: 600 }}>
                              Thanh toán: {new Date(p.paid_at).toLocaleString('vi-VN')}
                            </div>
                          )}
                        </td>
                        <td><strong>{Number(p.amount).toLocaleString('vi-VN')} đ</strong></td>
                        <td>
                          {isExpired ? (
                            <span className="badge badge-REJECTED">HẾT HẠN</span>
                          ) : (
                            <span className={`badge ${p.status === 'SUCCESS' ? 'badge-APPROVED' : 'badge-PENDING'}`}>
                              {p.status}
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.8rem' }}>
                          {refundedTotal > 0 ? `${refundedTotal.toLocaleString('vi-VN')} đ` : '—'}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {p.status === 'PENDING' && !isExpired && (
                            <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                              <a
                                href={`http://localhost:8004/api/v1/payments/${p.id}/checkout`}
                                className="btn btn-primary"
                                style={{ padding: '0.28rem 0.65rem', fontSize: '0.76rem', textDecoration: 'none' }}
                              >
                                Mở VNPay →
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
                          {isExpired && (
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                              Đã hết hạn thanh toán
                            </span>
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
                {user.created_at && (
                  <tr>
                    <td style={{ color: 'var(--text-muted)' }}>Thời gian tạo tài khoản</td>
                    <td style={{ fontSize: '0.84rem' }}>{new Date(user.created_at).toLocaleString('vi-VN')}</td>
                  </tr>
                )}
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

      {/* ==============================================================================
          CỬA SỔ THANH TOÁN (PAYMENT MODAL WINDOW - VNPAY SANDBOX & GIỮ CHỖ 10 PHÚT)
          ============================================================================== */}
      {paymentModal && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div
            className="modal-content"
            style={{
              maxWidth: 580,
              width: '100%',
              borderRadius: 14,
              padding: '1.75rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}
          >
            <button
              type="button"
              className="modal-close-btn"
              onClick={() => {
                if (paymentSuccessData || window.confirm('Bạn có muốn đóng cửa sổ thanh toán? Đơn giữ chỗ của bạn vẫn được lưu trong 10 phút.')) {
                  setPaymentModal(null);
                  setPaymentSuccessData(null);
                }
              }}
            >
              ×
            </button>

            {!paymentSuccessData ? (
              <div>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>💳</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                      Thanh toán Đơn đặt vé
                    </h3>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      Đơn giữ chỗ #{paymentModal.bookingId} • Mã GD: <span className="mono">{paymentModal.payment?.payment_code}</span>
                    </div>
                  </div>
                </div>

                {/* Countdown Timer Banner */}
                <div
                  style={{
                    padding: '0.75rem 1rem',
                    borderRadius: 8,
                    border: payRemainingSec > 120 ? '1px solid #bfdbfe' : '1px solid #fecaca',
                    background: payRemainingSec > 120 ? '#eff6ff' : '#fef2f2',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '1.15rem'
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.74rem', fontWeight: 700, color: payRemainingSec > 120 ? '#1e40af' : '#991b1b', textTransform: 'uppercase' }}>
                      Thời gian giữ chỗ:
                    </div>
                    <div style={{ fontSize: '0.75rem', color: payRemainingSec > 120 ? '#3b82f6' : '#dc2626' }}>
                      {payRemainingSec > 0 ? 'Vị trí được giữ trong 10 phút' : 'Đã hết hạn giữ chỗ!'}
                    </div>
                  </div>
                  <div style={{ fontSize: '1.45rem', fontWeight: 800, color: payRemainingSec > 120 ? '#2563eb' : '#dc2626', fontFamily: 'monospace' }}>
                    {formatRemainingTime(payRemainingSec)}
                  </div>
                </div>

                {/* Ticket & Event Summary Box */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem', marginBottom: '1.15rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b', marginBottom: '0.4rem' }}>
                    {paymentModal.eventTitle}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                    📍 {paymentModal.venueName}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', fontSize: '0.82rem', paddingTop: '0.65rem', borderTop: '1px dashed #cbd5e1' }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Hạng vé: </span>
                      <strong>{cleanName(paymentModal.ticketTypeName)}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Số lượng: </span>
                      <strong>{paymentModal.quantity} vé</strong>
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Vị trí: </span>
                      {paymentModal.seats.length > 0 ? (
                        <span style={{ display: 'inline-flex', gap: '0.35rem', flexWrap: 'wrap', marginLeft: '0.35rem' }}>
                          {paymentModal.seats.map((seatCode) => (
                            <span key={seatCode} style={{ background: '#2563eb', color: '#fff', padding: '0.1rem 0.45rem', borderRadius: 4, fontWeight: 700, fontSize: '0.75rem' }}>
                              {seatCode}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <strong style={{ color: '#059669' }}>🏃 Vé đứng (Fanzone)</strong>
                      )}
                    </div>
                  </div>

                  <div style={{ marginTop: '0.85rem', paddingTop: '0.75rem', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>TỔNG TIỀN:</span>
                    <span style={{ fontSize: '1.45rem', fontWeight: 800, color: '#dc2626' }}>
                      {Number(paymentModal.totalAmount).toLocaleString('vi-VN')} đ
                    </span>
                  </div>
                </div>

                {/* Nút chuyển sang cổng thanh toán VNPay */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.15rem' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      fontSize: '0.92rem',
                      fontWeight: 700,
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: '0.5rem',
                      background: 'linear-gradient(135deg, #1d4ed8, #2563eb)'
                    }}
                    onClick={() => {
                      if (paymentModal.payment?.payment_url) {
                        window.location.href = paymentModal.payment.payment_url;
                      }
                    }}
                    disabled={payRemainingSec === 0}
                  >
                    <span>💳 Thanh toán qua VNPay →</span>
                  </button>

                  <div style={{ textAlign: 'center', fontSize: '0.78rem', color: '#64748b', padding: '0.25rem 0' }}>
                    <span>Sau khi thanh toán xong, hệ thống tự động chuyển thẳng về trang web.</span>
                  </div>
                </div>

                {/* Footer nút Hủy */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem' }}>
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                    onClick={handleCancelBookingFromModal}
                    disabled={cancellingModalBooking}
                  >
                    {cancellingModalBooking ? 'Đang hủy...' : '✕ Hủy giữ chỗ'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ padding: '0.3rem 0.8rem', fontSize: '0.78rem' }}
                    onClick={() => setPaymentModal(null)}
                  >
                    Đóng
                  </button>
                </div>
              </div>
            ) : (
              /* Màn hình Thanh toán Thành công */
              <div style={{ textAlign: 'center', padding: '1rem 0.5rem' }}>
                <div style={{ width: 64, height: 64, background: '#dcfce7', color: '#16a34a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', margin: '0 auto 1rem' }}>
                  ✓
                </div>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#15803d', margin: '0 0 0.5rem' }}>
                  THANH TOÁN THÀNH CÔNG!
                </h3>
                <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                  Vé điện tử của bạn đã được xác nhận chính thức trên hệ thống.
                </p>

                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem', textAlign: 'left', marginBottom: '1.25rem', fontSize: '0.82rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Mã giao dịch VNPay:</span>
                    <strong className="mono">{paymentModal.payment?.payment_code}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Mã đơn giữ chỗ:</span>
                    <strong>#{paymentModal.bookingId}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Sự kiện:</span>
                    <strong>{paymentModal.eventTitle}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Hạng vé & Chỗ ngồi:</span>
                    <strong>{cleanName(paymentModal.ticketTypeName)} ({paymentModal.seats.join(', ') || 'Vé đứng'})</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.5rem', borderTop: '1px dashed #cbd5e1' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Số tiền đã thanh toán:</span>
                    <strong style={{ color: '#15803d', fontSize: '1.05rem' }}>{Number(paymentModal.totalAmount).toLocaleString('vi-VN')} đ</strong>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ padding: '0.6rem 1.25rem', fontSize: '0.85rem', fontWeight: 600 }}
                    onClick={() => {
                      setPaymentModal(null);
                      setPaymentSuccessData(null);
                      setTab('tickets');
                      fetchMyBookings();
                      fetchMyTickets();
                    }}
                  >
                    🎟️ Xem Vé QR của tôi
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ padding: '0.6rem 1.1rem', fontSize: '0.85rem' }}
                    onClick={() => {
                      setPaymentModal(null);
                      setPaymentSuccessData(null);
                    }}
                  >
                    Đóng cửa sổ
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
