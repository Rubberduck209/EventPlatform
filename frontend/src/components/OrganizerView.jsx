import React, { useState, useEffect } from 'react';
import { api } from '../api';
import ToastNotification from './ToastNotification';

const cleanName = (val) => (val ? String(val).replace(/\s*\([^)]*\)/g, '').trim() : '');

const toLocalInputDateTime = (dtValue) => {
  if (!dtValue) return '';
  const d = new Date(dtValue);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Nhãn trạng thái chỉ đọc theo đúng trình tự vòng đời sự kiện:
// Bản nháp -> (nhấn Publish) -> Công bố -> (tới giờ) -> Đang diễn ra -> (qua giờ) -> Đã kết thúc | (hủy xong) -> Đang hủy
const getEventStatusBadge = (ev) => {
  if (!ev) return { key: 'DRAFT', label: 'Bản nháp', bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' };
  if (ev.status === 'CANCELLED') {
    return { key: 'CANCELLED', label: 'Đang hủy', bg: '#fef2f2', color: '#dc2626', border: '#fecaca' };
  }
  if (ev.status === 'DRAFT') {
    return { key: 'DRAFT', label: 'Bản nháp', bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' };
  }
  const now = Date.now();
  const startMs = ev.start_time ? new Date(ev.start_time).getTime() : 0;
  const endMs = ev.end_time ? new Date(ev.end_time).getTime() : 0;

  if (ev.status === 'COMPLETED' || (endMs && now > endMs)) {
    return { key: 'COMPLETED', label: 'Đã kết thúc', bg: '#f3f4f6', color: '#374151', border: '#d1d5db' };
  }
  if (ev.status === 'HAPPENING' || (startMs && endMs && now >= startMs && now <= endMs)) {
    return { key: 'HAPPENING', label: 'Đang diễn ra', bg: '#fffbeb', color: '#d97706', border: '#fde68a' };
  }
  return { key: 'PUBLISHED', label: 'Công bố', bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' };
};

export default function OrganizerView({ user, onLogout }) {
  const [section, setSection] = useState('events'); // 'events' | 'config' | 'staff'
  const [eventsTab, setEventsTab] = useState('active'); // 'active' | 'cancelled'
  const [configTab, setConfigTab] = useState('zones'); // 'zones' | 'tickets'
  const [staffTab, setStaffTab] = useState('list'); // 'list' | 'assign'
  const [showCreateEventForm, setShowCreateEventForm] = useState(false);
  const [eventSearchQuery, setEventSearchQuery] = useState('');
  const [eventCategoryFilter, setEventCategoryFilter] = useState('');
  const [, setClockTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setClockTick((t) => t + 1), 10000);
    return () => clearInterval(timer);
  }, []);

  // Lấy số thứ tự ID riêng biệt cho từng tổ chức (tự động reset về #1 cho mỗi ban tổ chức)
  const getEventSeq = (ev) => {
    if (!ev) return '';
    if (ev.org_event_id) return ev.org_event_id;
    const sorted = [...myEvents].sort((a, b) => a.id - b.id);
    const idx = sorted.findIndex((item) => item.id === ev.id);
    return idx >= 0 ? idx + 1 : ev.id;
  };

  // Lấy số thứ tự Mã NV (#1, #2, #3...) độc lập cho từng Ban tổ chức
  const getStaffSeq = (staffOrUserId) => {
    if (!staffOrUserId) return '';
    const sorted = [...managedStaff].sort((a, b) => a.id - b.id);
    if (typeof staffOrUserId === 'object') {
      if (staffOrUserId.org_staff_id) return staffOrUserId.org_staff_id;
      const idx = sorted.findIndex((item) => Number(item.id) === Number(staffOrUserId.id));
      return idx >= 0 ? idx + 1 : staffOrUserId.id;
    }
    const idx = sorted.findIndex((item) => Number(item.id) === Number(staffOrUserId));
    return idx >= 0 ? idx + 1 : staffOrUserId;
  };

  // State cho Modal Xác thực Hủy Sự kiện Bảo mật 3 Lớp
  const [cancelModalEvent, setCancelModalEvent] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelConfirmTitle, setCancelConfirmTitle] = useState('');
  const [cancelPassword, setCancelPassword] = useState('');
  const [cancelOtp, setCancelOtp] = useState('');
  const [otpSentHint, setOtpSentHint] = useState('');
  const [requestingOtp, setRequestingOtp] = useState(false);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const [orgProfile, setOrgProfile] = useState(null);
  const [msg, setMsg] = useState({ text: '', type: '' });

  // Events & Categories State
  const [categories, setCategories] = useState([]);
  const [myEvents, setMyEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [selectedEventDetail, setSelectedEventDetail] = useState(null);

  // Create Event State
  const [evCategoryId, setEvCategoryId] = useState('');
  const [evTitle, setEvTitle] = useState('');
  const [evDesc, setEvDesc] = useState('');
  const [evVenueName, setEvVenueName] = useState('');
  const [evVenueAddr, setEvVenueAddr] = useState('');
  const [evStartTime, setEvStartTime] = useState('');
  const [evEndTime, setEvEndTime] = useState('');
  const [evRefundPolicy, setEvRefundPolicy] = useState('');
  const [evLoading, setEvLoading] = useState(false);

  // Zone & Grid Map Editor State
  const [zoneName, setZoneName] = useState('');
  const [zoneType, setZoneType] = useState('SEATED');
  const [zoneRows, setZoneRows] = useState(4);
  const [zoneCols, setZoneCols] = useState(8);
  const [zoneCapacity, setZoneCapacity] = useState(200);
  const [zoneDefaultTier, setZoneDefaultTier] = useState('STANDARD');
  const [zoneLoading, setZoneLoading] = useState(false);

  const [seatMapZones, setSeatMapZones] = useState([]);
  const [brushMode, setBrushMode] = useState('DISABLE');
  const [pendingZoneEdits, setPendingZoneEdits] = useState({});
  const [savingSeats, setSavingSeats] = useState(false);
  const [dragSelection, setDragSelection] = useState(null);

  // Ticket Type & Dynamic Pricing State
  const [ttZoneId, setTtZoneId] = useState('');
  const [ttName, setTtName] = useState('');
  const [ttBasePrice, setTtBasePrice] = useState('');
  const [ttMaxPerOrder, setTtMaxPerOrder] = useState(4);
  const [ttStudentDomain, setTtStudentDomain] = useState('');
  const [ttTotalQty, setTtTotalQty] = useState(50);
  const [ttSaleStartTime, setTtSaleStartTime] = useState('');
  const [ttSaleEndTime, setTtSaleEndTime] = useState('');
  const [editingTicketType, setEditingTicketType] = useState(null);
  const [enableEarlyBird, setEnableEarlyBird] = useState(false);
  const [ruleName, setRuleName] = useState('Early Bird');
  const [ruleDiscountPrice, setRuleDiscountPrice] = useState('');
  const [ruleStartDate, setRuleStartDate] = useState('');
  const [ruleEndDate, setRuleEndDate] = useState('');
  const [ttLoading, setTtLoading] = useState(false);

  // Staff Creation State
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffPassword, setNewStaffPassword] = useState('');
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [managedStaff, setManagedStaff] = useState([]);
  const [createLoading, setCreateLoading] = useState(false);

  // Staff Assignment State
  const [targetEventId, setTargetEventId] = useState(1);
  const [targetEventTitle, setTargetEventTitle] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffRoleTitle, setStaffRoleTitle] = useState('');
  const [permissions, setPermissions] = useState(['CHECKIN']);
  const [assignedStaffList, setAssignedStaffList] = useState([]);
  const [assignLoading, setAssignLoading] = useState(false);

  const fetchOrganizerProfile = async () => {
    try {
      const profile = await api.getMyOrganizerProfile();
      setOrgProfile(profile);
    } catch {
      setOrgProfile(null);
    }
  };

  const fetchEventServiceData = async () => {
    try {
      const [cats, events] = await Promise.all([
        api.getCategories(),
        api.getMyEvents()
      ]);
      setCategories(cats || []);
      if (cats && cats.length > 0 && !evCategoryId) {
        setEvCategoryId(cats[0].id);
      }
      setMyEvents(events || []);
      const activeList = (events || []).filter((e) => e.status !== 'CANCELLED');
      if (activeList.length > 0 && !selectedEventId) {
        setSelectedEventId(activeList[0].id);
        setTargetEventId(activeList[0].id);
        setTargetEventTitle(activeList[0].title);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchSelectedEventDetail = async (evId) => {
    if (!evId) return;
    try {
      const [detail, seatMapResp] = await Promise.all([
        api.getEventDetail(evId),
        api.getSeatMap(evId)
      ]);
      setSelectedEventDetail(detail);
      const zones = seatMapResp?.zones || [];
      setSeatMapZones(zones);
      setPendingZoneEdits({});
      setEditingTicketType(null);
      setTtSaleStartTime(toLocalInputDateTime(new Date()));
      setTtSaleEndTime(detail?.start_time ? toLocalInputDateTime(detail.start_time) : '');
      if (zones.length > 0 && !ttZoneId) {
        setTtZoneId(zones[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchManagedStaff = async () => {
    try {
      const data = await api.getMyManagedStaff();
      setManagedStaff(data);
      if (data.length > 0 && !staffEmail) {
        setStaffEmail(data[0].email);
      } else if (data.length === 0) {
        setStaffEmail('');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAssignedStaff = async () => {
    if (!targetEventId) return;
    try {
      const data = await api.getEventStaff(targetEventId);
      setAssignedStaffList(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchOrganizerProfile();
    fetchManagedStaff();
    fetchEventServiceData();
  }, [user]);

  useEffect(() => {
    if (selectedEventId) {
      fetchSelectedEventDetail(selectedEventId);
    }
  }, [selectedEventId]);

  useEffect(() => {
    fetchAssignedStaff();
  }, [targetEventId, user]);

  // Event Handlers
  const handleCreateEvent = async (e) => {
    e.preventDefault();
    setEvLoading(true);
    setMsg({ text: '', type: '' });
    try {
      const created = await api.createEvent({
        category_id: Number(evCategoryId),
        title: evTitle.trim(),
        description: evDesc.trim() || undefined,
        venue_name: evVenueName.trim(),
        venue_address: evVenueAddr.trim(),
        start_time: new Date(evStartTime).toISOString(),
        end_time: new Date(evEndTime).toISOString(),
        refund_policy: evRefundPolicy.trim() || undefined
      });
      setMsg({ text: `Đã tạo sự kiện "${created.title}".`, type: 'success' });
      setEvTitle('');
      setEvDesc('');
      setEvVenueName('');
      setEvVenueAddr('');
      setShowCreateEventForm(false);
      await fetchEventServiceData();
      setSelectedEventId(created.id);
      setTargetEventId(created.id);
      setTargetEventTitle(created.title);
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
    } finally {
      setEvLoading(false);
    }
  };

  const handleStatusChange = async (eventId, newStatus) => {
    setMsg({ text: '', type: '' });

    // Ràng buộc phía Client: Kiểm tra số loại vé tối thiểu tương ứng với từng phân loại chỗ ngồi
    if (newStatus === 'PUBLISHED' || newStatus === 'ON_SALE') {
      const targetDetail = Number(selectedEventId) === Number(eventId) ? selectedEventDetail : null;
      if (targetDetail) {
        const zones = seatMapZones || [];
        const ticketTypes = targetDetail.ticket_types || [];
        if (zones.length === 0) {
          setMsg({ text: 'Sự kiện chưa có khu vực tổ chức nào. Vui lòng tạo ít nhất 1 khu vực trước khi công bố!', type: 'error' });
          return;
        }
        for (const z of zones) {
          const zTts = ticketTypes.filter((tt) => tt.zone_id === z.id);
          if (zTts.length === 0) {
            setMsg({ text: `Khu vực "${cleanName(z.name)}" chưa có loại vé nào. Bạn phải tạo ít nhất 1 loại vé cho khu vực này!`, type: 'error' });
            return;
          }
          if (z.zone_type === 'SEATED') {
            const activeSeats = (z.seats || []).filter((s) => !s.is_disabled);
            const distinctTiers = Array.from(new Set(activeSeats.map((s) => s.seat_tier || 'STANDARD')));
            if (zTts.length < distinctTiers.length) {
              setMsg({
                text: `Ràng buộc sơ đồ chỗ ngồi: Khu vực "${cleanName(z.name)}" có ${distinctTiers.length} phân loại chỗ ngồi (${distinctTiers.join(', ')}). Ban tổ chức phải tạo tối thiểu ${distinctTiers.length} loại vé tương ứng cho từng phân loại chỗ ngồi (hiện mới có ${zTts.length} loại vé).`,
                type: 'error'
              });
              return;
            }
            const totalQty = zTts.reduce((acc, curr) => acc + (curr.total_quantity || 0), 0);
            if (totalQty < activeSeats.length) {
              setMsg({
                text: `Khu vực "${cleanName(z.name)}" có ${activeSeats.length} ghế ngồi khả dụng nhưng các hạng vé chỉ phát hành ${totalQty} vé. Tổng số lượng vé tối thiểu phải bằng số ghế (${activeSeats.length} vé)!`,
                type: 'error'
              });
              return;
            }
          }
        }
      }
    }

    try {
      await api.updateEventStatus(eventId, newStatus);
      setMsg({ text: `Đã cập nhật trạng thái sự kiện #${eventId}.`, type: 'success' });
      fetchEventServiceData();
      if (Number(selectedEventId) === Number(eventId)) {
        fetchSelectedEventDetail(eventId);
      }
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
    }
  };

  const handleDeleteEvent = async (ev) => {
    if (!window.confirm(`Xóa vĩnh viễn sự kiện bản nháp "${ev.title}"?`)) {
      return;
    }
    setMsg({ text: '', type: '' });
    try {
      await api.deleteEvent(ev.id);
      setMsg({ text: `Đã xóa sự kiện "${ev.title}".`, type: 'success' });
      const remaining = myEvents.filter((item) => item.id !== ev.id);
      setMyEvents(remaining);
      if (Number(selectedEventId) === Number(ev.id)) {
        if (remaining.length > 0) {
          setSelectedEventId(remaining[0].id);
        } else {
          setSelectedEventId('');
          setSelectedEventDetail(null);
          setSeatMapZones([]);
        }
      }
      fetchEventServiceData();
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
    }
  };

  const handleDeleteZone = async (zone) => {
    if (!window.confirm(`Xóa khu vực "${cleanName(zone.name)}" cùng toàn bộ sơ đồ ghế của khu vực này?`)) {
      return;
    }
    setMsg({ text: '', type: '' });
    try {
      await api.deleteZone(zone.id);
      setMsg({ text: `Đã xóa khu vực "${cleanName(zone.name)}".`, type: 'success' });
      const nextPending = { ...pendingZoneEdits };
      delete nextPending[zone.id];
      setPendingZoneEdits(nextPending);
      if (Number(ttZoneId) === Number(zone.id)) {
        setTtZoneId('');
      }
      fetchSelectedEventDetail(selectedEventId);
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
    }
  };

  const handleDeleteTicketType = async (tt) => {
    if (!window.confirm(`Xóa hạng vé "${cleanName(tt.name)}"?`)) {
      return;
    }
    setMsg({ text: '', type: '' });
    try {
      await api.deleteTicketType(tt.id);
      setMsg({ text: `Đã xóa hạng vé "${cleanName(tt.name)}".`, type: 'success' });
      fetchSelectedEventDetail(selectedEventId);
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
    }
  };

  // Mở Modal Xác thực Hủy Sự Kiện Bảo Mật 3 Lớp
  const openCancelModal = (ev) => {
    setCancelModalEvent(ev);
    setCancelReason('');
    setCancelConfirmTitle('');
    setCancelPassword('');
    setCancelOtp('');
    setOtpSentHint('');
  };

  const handleRequestCancelOtp = async () => {
    if (!cancelModalEvent) return;
    setRequestingOtp(true);
    setMsg({ text: '', type: '' });
    try {
      const res = await api.requestEventCancelOtp(cancelModalEvent.id);
      if (res.otp_code_demo) {
        setOtpSentHint(`Mã OTP vừa gửi tới ${user.email}: ${res.otp_code_demo}`);
      }
      setMsg({ text: res.message || 'Đã gửi mã OTP xác nhận hủy sự kiện.', type: 'success' });
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
    } finally {
      setRequestingOtp(false);
    }
  };

  const handleConfirmCancelEvent = async (e) => {
    e.preventDefault();
    if (!cancelModalEvent) return;
    setCancelSubmitting(true);
    setMsg({ text: '', type: '' });
    try {
      // 1. Xác thực 3 lớp (Tên sự kiện + Mã OTP 6 số + Mật khẩu tài khoản Organizer) và hủy sự kiện
      await api.cancelEventVerified(cancelModalEvent.id, {
        password: cancelPassword,
        otp_code: cancelOtp.trim(),
        confirm_title: cancelConfirmTitle.trim(),
        reason: cancelReason.trim(),
      });

      // 2. Tự động kích hoạt hoàn tiền 100% bên Payment Service
      let refundSummary = '';
      try {
        const refRes = await api.refundPaymentsByEvent(cancelModalEvent.id, cancelReason.trim());
        if (refRes?.refunded_transactions > 0) {
          refundSummary = ` Đã tự động hoàn tiền ${refRes.refunded_transactions} giao dịch (${Number(refRes.total_refunded_amount).toLocaleString('vi-VN')} đ).`;
        } else {
          refundSummary = ' Đã kích hoạt lệnh hoàn tiền tự động và gửi thông báo cho khách hàng.';
        }
      } catch {
        refundSummary = ' Đã phát thông báo hủy và lệnh hoàn tiền tự động.';
      }

      const cancelledTitle = cancelModalEvent.title;
      const cancelledId = cancelModalEvent.id;
      setCancelModalEvent(null);
      setMsg({
        text: `Đã hủy sự kiện "${cancelledTitle}".${refundSummary} Sự kiện đã được chuyển sang mục Đã hủy trong tháng.`,
        type: 'success',
      });

      await fetchEventServiceData();
      setEventsTab('cancelled');
      if (Number(selectedEventId) === Number(cancelledId)) {
        const nextActive = myEvents.find((item) => item.id !== cancelledId && item.status !== 'CANCELLED');
        if (nextActive) {
          setSelectedEventId(nextActive.id);
        } else {
          setSelectedEventId('');
          setSelectedEventDetail(null);
        }
      }
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
    } finally {
      setCancelSubmitting(false);
    }
  };

  // Zone & Seat Map Handlers
  const handleCreateZone = async (e) => {
    e.preventDefault();
    if (!selectedEventId) return;
    setZoneLoading(true);
    setMsg({ text: '', type: '' });
    try {
      const payload =
        zoneType === 'SEATED'
          ? {
              name: zoneName.trim(),
              zone_type: 'SEATED',
              grid_rows: Number(zoneRows),
              grid_cols: Number(zoneCols),
              default_seat_tier: zoneDefaultTier
            }
          : {
              name: zoneName.trim(),
              zone_type: 'STANDING',
              total_capacity: Number(zoneCapacity)
            };

      const created = await api.createZone(selectedEventId, payload);
      setMsg({
        text: `Đã tạo khu vực "${created.name}".`,
        type: 'success'
      });
      setZoneName('');
      setTtZoneId(created.id);
      fetchSelectedEventDetail(selectedEventId);
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
    } finally {
      setZoneLoading(false);
    }
  };

  const isEditable = selectedEventDetail?.status === 'DRAFT';

  const applyBrushToSeats = (zoneId, seatsList, forceDisableValue = null) => {
    if (!isEditable || !seatsList || seatsList.length === 0) return;
    setPendingZoneEdits((prev) => {
      const zoneEdits = { ...(prev[zoneId] || {}) };
      for (const seat of seatsList) {
        const current = zoneEdits[seat.seat_code] || {
          seat_code: seat.seat_code,
          is_disabled: seat.is_disabled,
          seat_tier: seat.seat_tier || 'STANDARD'
        };

        if (brushMode === 'DISABLE') {
          const nextDisabled =
            forceDisableValue !== null ? forceDisableValue : !current.is_disabled;
          zoneEdits[seat.seat_code] = {
            seat_code: seat.seat_code,
            is_disabled: nextDisabled,
            seat_tier: current.seat_tier
          };
        } else if (brushMode === 'ENABLE') {
          zoneEdits[seat.seat_code] = {
            seat_code: seat.seat_code,
            is_disabled: false,
            seat_tier: current.seat_tier
          };
        } else {
          zoneEdits[seat.seat_code] = {
            seat_code: seat.seat_code,
            is_disabled: false,
            seat_tier: brushMode
          };
        }
      }
      return {
        ...prev,
        [zoneId]: zoneEdits
      };
    });
  };

  const handleSeatMouseDown = (e, zone, seat) => {
    if (!isEditable || e.button !== 0) return;
    e.preventDefault();
    const edited = pendingZoneEdits[zone.id]?.[seat.seat_code];
    const currentDisabled = edited ? edited.is_disabled : seat.is_disabled;
    setDragSelection({
      zoneId: zone.id,
      startRow: seat.row_index,
      startCol: seat.col_index,
      endRow: seat.row_index,
      endCol: seat.col_index,
      disableTarget: !currentDisabled
    });
  };

  const handleSeatMouseEnter = (zone, seat) => {
    if (!dragSelection || dragSelection.zoneId !== zone.id) return;
    setDragSelection((prev) =>
      prev
        ? {
            ...prev,
            endRow: seat.row_index,
            endCol: seat.col_index
          }
        : null
    );
  };

  useEffect(() => {
    if (!dragSelection) return;
    const handleWindowMouseUp = () => {
      const zone = seatMapZones.find((z) => z.id === dragSelection.zoneId);
      if (zone && zone.seats) {
        const minR = Math.min(dragSelection.startRow, dragSelection.endRow);
        const maxR = Math.max(dragSelection.startRow, dragSelection.endRow);
        const minC = Math.min(dragSelection.startCol, dragSelection.endCol);
        const maxC = Math.max(dragSelection.startCol, dragSelection.endCol);
        const affectedSeats = zone.seats.filter(
          (s) =>
            s.row_index >= minR &&
            s.row_index <= maxR &&
            s.col_index >= minC &&
            s.col_index <= maxC
        );
        applyBrushToSeats(zone.id, affectedSeats, dragSelection.disableTarget);
      }
      setDragSelection(null);
    };

    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => window.removeEventListener('mouseup', handleWindowMouseUp);
  }, [dragSelection, seatMapZones, brushMode, isEditable]);

  const isSeatInDragBox = (zoneId, seat) => {
    if (!dragSelection || dragSelection.zoneId !== zoneId) return false;
    const minR = Math.min(dragSelection.startRow, dragSelection.endRow);
    const maxR = Math.max(dragSelection.startRow, dragSelection.endRow);
    const minC = Math.min(dragSelection.startCol, dragSelection.endCol);
    const maxC = Math.max(dragSelection.startCol, dragSelection.endCol);
    return (
      seat.row_index >= minR &&
      seat.row_index <= maxR &&
      seat.col_index >= minC &&
      seat.col_index <= maxC
    );
  };

  const handleSaveSeatMap = async () => {
    const zoneIds = Object.keys(pendingZoneEdits);
    if (!selectedEventId || zoneIds.length === 0) return;
    setSavingSeats(true);
    setMsg({ text: '', type: '' });
    try {
      let totalChanged = 0;
      for (const zId of zoneIds) {
        const seatsArray = Object.values(pendingZoneEdits[zId] || {});
        if (seatsArray.length > 0) {
          await api.batchUpdateZoneSeats(Number(zId), seatsArray);
          totalChanged += seatsArray.length;
        }
      }
      setMsg({ text: `Đã lưu cập nhật ${totalChanged} vị trí ghế.`, type: 'success' });
      fetchSelectedEventDetail(selectedEventId);
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
    } finally {
      setSavingSeats(false);
    }
  };

  // Ticket Type & Dynamic Pricing Handler (Tạo mới & Chỉnh sửa trong Editor)
  const handleStartEditTicketType = (tt) => {
    setEditingTicketType(tt);
    setTtZoneId(tt.zone_id);
    setTtName(cleanName(tt.name));
    setTtBasePrice(tt.current_price != null ? tt.current_price : '');
    setTtTotalQty(tt.total_quantity);
    setTtMaxPerOrder(tt.max_per_order || 4);
    setTtStudentDomain(tt.student_email_domain || '');
    setTtSaleStartTime(toLocalInputDateTime(tt.sale_start_time || tt.created_at || new Date()));
    setTtSaleEndTime(toLocalInputDateTime(tt.sale_end_time || selectedEventDetail?.start_time));
  };

  const handleCancelEditTicketType = () => {
    setEditingTicketType(null);
    setTtName('');
    setTtBasePrice('');
    setTtStudentDomain('');
    setTtSaleStartTime(toLocalInputDateTime(new Date()));
    setTtSaleEndTime(selectedEventDetail?.start_time ? toLocalInputDateTime(selectedEventDetail.start_time) : '');
  };

  const handleCreateTicketType = async (e) => {
    e.preventDefault();
    if (!selectedEventId || !ttZoneId) return;

    const saleStartObj = ttSaleStartTime ? new Date(ttSaleStartTime) : new Date();
    const saleEndObj = ttSaleEndTime
      ? new Date(ttSaleEndTime)
      : selectedEventDetail?.start_time
      ? new Date(selectedEventDetail.start_time)
      : null;

    if (saleEndObj && saleEndObj <= saleStartObj) {
      setMsg({ text: 'Thời gian kết thúc bán vé phải lớn hơn thời gian bắt đầu bán vé!', type: 'error' });
      return;
    }
    if (saleEndObj && selectedEventDetail?.start_time && saleEndObj > new Date(selectedEventDetail.start_time)) {
      setMsg({ text: 'Thời gian kết thúc bán vé phải trước hoặc bằng thời gian diễn ra sự kiện!', type: 'error' });
      return;
    }

    setTtLoading(true);
    setMsg({ text: '', type: '' });
    try {
      const studentDomainClean = ttStudentDomain.trim();

      if (editingTicketType) {
        const updated = await api.updateTicketType(editingTicketType.id, {
          name: ttName.trim(),
          base_price: Number(ttBasePrice),
          max_per_order: Number(ttMaxPerOrder),
          is_student_only: Boolean(studentDomainClean),
          student_email_domain: studentDomainClean || '',
          total_quantity: Number(ttTotalQty),
          sale_start_time: saleStartObj.toISOString(),
          sale_end_time: saleEndObj ? saleEndObj.toISOString() : null
        });
        setMsg({
          text: `Đã cập nhật hạng vé "${updated.name}".`,
          type: 'success'
        });
        setEditingTicketType(null);
      } else {
        const pricingRules = [];
        if (enableEarlyBird && ruleName.trim() && ruleDiscountPrice && ruleStartDate && ruleEndDate) {
          pricingRules.push({
            rule_name: ruleName.trim(),
            price: Number(ruleDiscountPrice),
            start_time: new Date(ruleStartDate).toISOString(),
            end_time: new Date(ruleEndDate).toISOString()
          });
        }

        const created = await api.createTicketType(selectedEventId, {
          zone_id: Number(ttZoneId),
          name: ttName.trim(),
          base_price: Number(ttBasePrice),
          max_per_order: Number(ttMaxPerOrder),
          is_student_only: Boolean(studentDomainClean),
          student_email_domain: studentDomainClean || null,
          total_quantity: Number(ttTotalQty),
          sale_start_time: saleStartObj.toISOString(),
          sale_end_time: saleEndObj ? saleEndObj.toISOString() : null,
          pricing_rules: pricingRules.length > 0 ? pricingRules : null
        });
        setMsg({
          text: `Đã lưu hạng vé "${created.name}".`,
          type: 'success'
        });
      }

      setTtName('');
      setTtBasePrice('');
      setRuleDiscountPrice('');
      fetchSelectedEventDetail(selectedEventId);
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
    } finally {
      setTtLoading(false);
    }
  };

  // Staff Handlers
  const handleCreateStaff = async (e) => {
    e.preventDefault();
    setCreateLoading(true);
    setMsg({ text: '', type: '' });
    try {
      const res = await api.createStaff({
        email: newStaffEmail.trim(),
        password: newStaffPassword,
        full_name: newStaffName,
        phone: newStaffPhone || undefined
      });
      setMsg({
        text: `Đã thêm nhân viên '${res.full_name}'.`,
        type: 'success'
      });
      setStaffEmail(res.email);
      setNewStaffEmail('');
      setNewStaffName('');
      setNewStaffPassword('');
      setNewStaffPhone('');
      fetchManagedStaff();
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDeleteStaff = async (staff) => {
    if (!window.confirm(`Xóa nhân viên "${cleanName(staff.full_name)}" khỏi danh sách?`)) {
      return;
    }
    setMsg({ text: '', type: '' });
    try {
      await api.deleteStaff(staff.id);
      setMsg({ text: `Đã xóa nhân viên '${cleanName(staff.full_name)}'.`, type: 'success' });
      fetchManagedStaff();
      fetchAssignedStaff();
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
    }
  };

  const handleAssignStaff = async (e) => {
    e.preventDefault();
    if (!staffEmail || !targetEventId || !staffRoleTitle.trim() || permissions.length === 0) {
      setMsg({ text: 'Vui lòng chọn nhân viên, sự kiện, vị trí trực và ít nhất 1 quyền hạn.', type: 'error' });
      return;
    }

    setAssignLoading(true);
    setMsg({ text: '', type: '' });
    try {
      await api.assignStaff({
        event_id: Number(targetEventId),
        event_title: targetEventTitle.trim() || `Sự kiện #${targetEventId}`,
        staff_email: staffEmail.trim(),
        staff_role_title: staffRoleTitle.trim(),
        permissions: permissions
      });
      const evObj = myEvents.find((ev) => Number(ev.id) === Number(targetEventId));
      setMsg({ text: `Đã phân công nhân sự vào Sự kiện #${evObj ? getEventSeq(evObj) : targetEventId}.`, type: 'success' });
      setStaffRoleTitle('');
      fetchAssignedStaff();
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
    } finally {
      setAssignLoading(false);
    }
  };

  const handleUnassignStaff = async (assignment) => {
    setMsg({ text: '', type: '' });
    try {
      await api.unassignEventStaff(targetEventId, assignment.staff_user_id);
      setMsg({ text: `Đã gỡ nhân viên '${cleanName(assignment.staff_name)}' khỏi sự kiện.`, type: 'success' });
      fetchAssignedStaff();
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
    }
  };

  const togglePermission = (perm) => {
    if (permissions.includes(perm)) {
      setPermissions(permissions.filter((p) => p !== perm));
    } else {
      setPermissions([...permissions, perm]);
    }
  };

  const getSeatBadgeStyle = (zoneId, seat) => {
    const edited = pendingZoneEdits[zoneId]?.[seat.seat_code];
    const isDisabled = edited ? edited.is_disabled : seat.is_disabled;
    const tier = edited ? edited.seat_tier : (seat.seat_tier || 'STANDARD');

    if (isDisabled) {
      return { background: '#1e293b', color: '#94a3b8', border: '1px solid #0f172a', textDecoration: 'line-through' };
    }
    if (tier === 'VIP') {
      return { background: '#fef3c7', color: '#92400e', border: '1px solid #f59e0b' };
    }
    if (tier === 'STUDENT') {
      return { background: '#dcfce7', color: '#166534', border: '1px solid #22c55e' };
    }
    return { background: '#eff6ff', color: '#1e40af', border: '1px solid #93c5fd' };
  };

  const totalPendingSeats = Object.values(pendingZoneEdits).reduce(
    (acc, zMap) => acc + Object.keys(zMap).length,
    0
  );

  const orgDisplayName = cleanName(orgProfile?.organization_name || user.full_name);

  const activeEvents = myEvents.filter((ev) => ev.status !== 'CANCELLED');
  const filteredActiveEvents = myEvents.filter((ev) => {
    if (eventCategoryFilter && String(ev.category_id) !== String(eventCategoryFilter)) {
      return false;
    }
    if (eventSearchQuery.trim()) {
      const q = eventSearchQuery.toLowerCase().trim();
      const matchTitle = ev.title?.toLowerCase().includes(q);
      const matchVenue = ev.venue_name?.toLowerCase().includes(q) || ev.venue_address?.toLowerCase().includes(q);
      const matchCat = ev.category_name?.toLowerCase().includes(q);
      const matchSeq = String(getEventSeq(ev)).includes(q);
      return matchTitle || matchVenue || matchCat || matchSeq;
    }
    return true;
  });

  const nowDate = new Date();
  const currentMonthLabel = `${String(nowDate.getMonth() + 1).padStart(2, '0')}/${nowDate.getFullYear()}`;
  const cancelledEventsThisMonth = myEvents.filter((ev) => {
    if (ev.status !== 'CANCELLED') return false;
    const cancelTime = new Date(ev.cancelled_at || ev.updated_at || ev.created_at);
    return (
      cancelTime.getMonth() === nowDate.getMonth() &&
      cancelTime.getFullYear() === nowDate.getFullYear()
    );
  });

  return (
    <div className="layout-organizer" style={{ minHeight: '100vh' }}>
      <aside className="organizer-aside">
        <div>
          {/* Logo & Thẻ định danh Ban tổ chức */}
          <div style={{ padding: '0 0.25rem 1.25rem', borderBottom: '1px solid var(--border)', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.85rem' }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1.15rem', boxShadow: '0 2px 6px rgba(37,99,235,0.3)' }}>
                🎟️
              </div>
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#1e293b', letterSpacing: '0.04em' }}>
                  EVENTHUB STUDIO
                </div>
                <div style={{ fontSize: '0.68rem', color: '#2563eb', fontWeight: 600 }}>
                  ORGANIZER WORKBENCH
                </div>
              </div>
            </div>

            {/* Thẻ định danh Tổ chức (Organization Identity Card) */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.65rem 0.8rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                  🏢 Ban tổ chức
                </span>
                <span style={{ fontSize: '0.65rem', background: '#dcfce7', color: '#15803d', padding: '0.1rem 0.4rem', borderRadius: 4, fontWeight: 700 }}>
                  Đang hoạt động
                </span>
              </div>
              <div style={{ fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                {orgDisplayName}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 2 }}>
                ID Tổ chức: #{user.id ? `ORG-${String(user.id).padStart(3, '0')}` : 'ORG-001'}
              </div>
            </div>
          </div>

          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 0.5rem 0.4rem' }}>
            Menu Quản lý
          </div>
          <button
            type="button"
            className={`organizer-menu-btn ${section === 'events' ? 'active' : ''}`}
            onClick={() => setSection('events')}
          >
            <span style={{ fontSize: '1.1rem' }}>📅</span>
            <span>Quản lý Sự kiện</span>
          </button>
          <button
            type="button"
            className={`organizer-menu-btn ${section === 'config' ? 'active' : ''}`}
            onClick={() => setSection('config')}
          >
            <span style={{ fontSize: '1.1rem' }}>🗺️</span>
            <span>Sơ đồ ghế & Giá vé</span>
          </button>
          <button
            type="button"
            className={`organizer-menu-btn ${section === 'staff' ? 'active' : ''}`}
            onClick={() => setSection('staff')}
          >
            <span style={{ fontSize: '1.1rem' }}>👥</span>
            <span>Nhân sự & Soát vé</span>
          </button>
        </div>

        {/* User Profile Card */}
        <div style={{ padding: '0.85rem', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.8rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.65rem' }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#dbeafe', color: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.85rem' }}>
              {(cleanName(user.full_name) || user.email || 'O')[0].toUpperCase()}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontWeight: 700, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                {cleanName(user.full_name)}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                {user.email}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-outline"
            onClick={onLogout}
            style={{ width: '100%', padding: '0.35rem', fontSize: '0.76rem', color: '#dc2626', borderColor: '#fca5a5' }}
          >
            Đăng xuất
          </button>
        </div>
      </aside>

      <div className="organizer-content">
        <ToastNotification msg={msg} onClose={() => setMsg({ text: '', type: '' })} />

        {/* ==================== MỤC 1: DANH SÁCH SỰ KIỆN ==================== */}
        {section === 'events' && (
          <div>
            {/* KPI Overview Cards */}
            <div className="org-kpi-grid">
              <div className="org-kpi-card">
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Tổng sự kiện
                  </div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginTop: '0.15rem' }}>
                    {myEvents.length}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#2563eb', fontWeight: 600, marginTop: 2 }}>
                    Mã #1 - #{myEvents.length || 1}
                  </div>
                </div>
                <div style={{ width: 46, height: 46, borderRadius: 12, background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', boxShadow: '0 2px 5px rgba(37,99,235,0.12)' }}>
                  🎪
                </div>
              </div>

              <div className="org-kpi-card">
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Đang hoạt động
                  </div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#16a34a', marginTop: '0.15rem' }}>
                    {activeEvents.length}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 600, marginTop: 2 }}>
                    Đang diễn ra
                  </div>
                </div>
                <div style={{ width: 46, height: 46, borderRadius: 12, background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', boxShadow: '0 2px 5px rgba(22,163,74,0.12)' }}>
                  🟢
                </div>
              </div>

              <div className="org-kpi-card">
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Bản nháp
                  </div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#475569', marginTop: '0.15rem' }}>
                    {activeEvents.filter(e => e.status === 'DRAFT').length}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, marginTop: 2 }}>
                    Chưa công bố
                  </div>
                </div>
                <div style={{ width: 46, height: 46, borderRadius: 12, background: '#f1f5f9', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>
                  📝
                </div>
              </div>

              <div className="org-kpi-card">
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Đang mở bán
                  </div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#2563eb', marginTop: '0.15rem' }}>
                    {activeEvents.filter(e => e.status === 'ON_SALE').length}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#2563eb', fontWeight: 600, marginTop: 2 }}>
                    Khách có thể mua
                  </div>
                </div>
                <div style={{ width: 46, height: 46, borderRadius: 12, background: '#dbeafe', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', boxShadow: '0 2px 5px rgba(37,99,235,0.12)' }}>
                  🎟️
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                  <span className="card-title" style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span>Quản lý Sự kiện</span>
                    <span style={{ fontSize: '0.74rem', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '0.15rem 0.55rem', borderRadius: 999, fontWeight: 700 }}>
                      🏢 {orgDisplayName}
                    </span>
                  </span>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    Danh sách sự kiện của tổ chức
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: '0.35rem', background: 'var(--bg-page)', padding: 4, borderRadius: 8, border: '1px solid var(--border)' }}>
                    <button
                      type="button"
                      className={`portal-switch-btn ${eventsTab === 'active' ? 'active' : ''}`}
                      onClick={() => setEventsTab('active')}
                    >
                      Đang hoạt động ({activeEvents.length})
                    </button>
                    <button
                      type="button"
                      className={`portal-switch-btn ${eventsTab === 'cancelled' ? 'active' : ''}`}
                      onClick={() => setEventsTab('cancelled')}
                    >
                      Đã hủy ({cancelledEventsThisMonth.length})
                    </button>
                  </div>

                  {eventsTab === 'active' && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => setShowCreateEventForm(!showCreateEventForm)}
                      style={{ boxShadow: '0 2px 8px rgba(37,99,235,0.25)', fontWeight: 700 }}
                    >
                      {showCreateEventForm ? 'Đóng' : '+ Tạo sự kiện'}
                    </button>
                  )}
                </div>
              </div>

            {eventsTab === 'active' && showCreateEventForm && (
              <form
                onSubmit={handleCreateEvent}
                style={{
                  marginBottom: '1.5rem',
                  padding: '1.25rem',
                  background: 'var(--bg-page)',
                  borderRadius: 8,
                  border: '1px solid var(--border)'
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.85rem', marginBottom: '0.85rem' }}>
                  <div>
                    <label className="form-label">Danh mục</label>
                    <select
                      required
                      className="form-input"
                      value={evCategoryId}
                      onChange={(e) => setEvCategoryId(e.target.value)}
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Tên sự kiện</label>
                    <input
                      type="text"
                      required
                      className="form-input"
                      placeholder="Nhập tên sự kiện"
                      value={evTitle}
                      onChange={(e) => setEvTitle(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.85rem', marginBottom: '0.85rem' }}>
                  <div>
                    <label className="form-label">Địa điểm</label>
                    <input
                      type="text"
                      required
                      className="form-input"
                      placeholder="Tên hội trường / sân vận động"
                      value={evVenueName}
                      onChange={(e) => setEvVenueName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="form-label">Địa chỉ</label>
                    <input
                      type="text"
                      required
                      className="form-input"
                      placeholder="Số nhà, đường, quận/huyện"
                      value={evVenueAddr}
                      onChange={(e) => setEvVenueAddr(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="form-label">Bắt đầu</label>
                    <input
                      type="datetime-local"
                      required
                      className="form-input"
                      value={evStartTime}
                      onChange={(e) => setEvStartTime(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="form-label">Kết thúc</label>
                    <input
                      type="datetime-local"
                      required
                      className="form-input"
                      value={evEndTime}
                      onChange={(e) => setEvEndTime(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr auto', gap: '0.85rem', alignItems: 'end' }}>
                  <div>
                    <label className="form-label">Mô tả ngắn</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Giới thiệu chương trình"
                      value={evDesc}
                      onChange={(e) => setEvDesc(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="form-label">Chính sách hoàn vé</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="VD: Trước 7 ngày"
                      value={evRefundPolicy}
                      onChange={(e) => setEvRefundPolicy(e.target.value)}
                    />
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={evLoading}>
                    {evLoading ? 'Đang lưu...' : 'Lưu sự kiện'}
                  </button>
                </div>
              </form>
            )}

            {eventsTab === 'active' ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Tên sự kiện</th>
                    <th>Địa điểm</th>
                    <th>Thời gian</th>
                    <th style={{ width: 170 }}>Trạng thái</th>
                    <th style={{ textAlign: 'right' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredActiveEvents.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                        {activeEvents.length === 0 ? 'Chưa có sự kiện nào.' : 'Không tìm thấy sự kiện phù hợp.'}
                      </td>
                    </tr>
                  ) : (
                    filteredActiveEvents.map((ev) => (
                      <tr key={ev.id}>
                        <td>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '0.2rem 0.55rem',
                              background: '#eff6ff',
                              color: '#1d4ed8',
                              fontWeight: 700,
                              fontSize: '0.8rem',
                              borderRadius: 6,
                              fontFamily: 'monospace',
                              border: '1px solid #bfdbfe'
                            }}
                          >
                            #{getEventSeq(ev)}
                          </span>
                        </td>
                        <td>
                          <strong>{ev.title}</strong>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {ev.category_name || `Danh mục #${ev.category_id}`}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{ev.venue_name}</div>
                          {ev.venue_address && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                              📍 {ev.venue_address}
                            </div>
                          )}
                        </td>
                        <td style={{ fontSize: '0.82rem' }}>
                          <div>{new Date(ev.start_time).toLocaleString('vi-VN')}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            Tạo: {new Date(ev.created_at).toLocaleDateString('vi-VN')}
                          </div>
                        </td>
                        <td>
                          {(() => {
                            const st = getEventStatusBadge(ev);
                            return (
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '0.24rem 0.65rem',
                                  borderRadius: 999,
                                  fontSize: '0.76rem',
                                  fontWeight: 700,
                                  background: st.bg,
                                  color: st.color,
                                  border: `1px solid ${st.border}`
                                }}
                              >
                                {st.label}
                              </span>
                            );
                          })()}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
                            {ev.status === 'DRAFT' && (
                              <button
                                type="button"
                                className="btn btn-primary"
                                style={{ padding: '0.32rem 0.7rem', fontSize: '0.78rem' }}
                                onClick={() => handleStatusChange(ev.id, 'PUBLISHED')}
                              >
                                Công bố
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn btn-outline"
                              style={{ padding: '0.32rem 0.75rem', fontSize: '0.78rem' }}
                              onClick={() => {
                                setSelectedEventId(ev.id);
                                setSection('config');
                              }}
                            >
                              {ev.status === 'DRAFT' ? 'Sơ đồ & Vé →' : 'Xem sơ đồ →'}
                            </button>
                            {ev.status === 'DRAFT' ? (
                              <button
                                type="button"
                                className="btn btn-danger"
                                style={{ padding: '0.32rem 0.65rem', fontSize: '0.78rem' }}
                                onClick={() => handleDeleteEvent(ev)}
                              >
                                Xóa
                              </button>
                            ) : (
                              ev.status !== 'CANCELLED' &&
                              getEventStatusBadge(ev).key !== 'COMPLETED' && (
                                <button
                                  type="button"
                                  className="btn btn-danger"
                                  style={{ padding: '0.32rem 0.65rem', fontSize: '0.78rem' }}
                                  onClick={() => openCancelModal(ev)}
                                >
                                  Hủy
                                </button>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : (
              <div>
                <div
                  style={{
                    padding: '0.65rem 0.9rem',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: 6,
                    color: '#991b1b',
                    fontSize: '0.82rem',
                    marginBottom: '1rem'
                  }}
                >
                  Sự kiện đã hủy trong tháng <strong>{currentMonthLabel}</strong> (đã hoàn tiền 100%).
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Tên sự kiện</th>
                      <th>Địa điểm</th>
                      <th>Thời gian hủy</th>
                      <th>Lý do hủy</th>
                      <th>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cancelledEventsThisMonth.length === 0 ? (
                      <tr>
                        <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                          Không có sự kiện bị hủy trong tháng {currentMonthLabel}.
                        </td>
                      </tr>
                    ) : (
                      cancelledEventsThisMonth.map((ev) => {
                        const cancelTime = ev.cancelled_at || ev.updated_at || ev.created_at;
                        return (
                          <tr key={ev.id}>
                            <td>
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '0.2rem 0.55rem',
                                  background: '#fee2e2',
                                  color: '#dc2626',
                                  fontWeight: 700,
                                  fontSize: '0.8rem',
                                  borderRadius: 6,
                                  fontFamily: 'monospace',
                                  border: '1px solid #fecaca'
                                }}
                              >
                                #{getEventSeq(ev)}
                              </span>
                            </td>
                            <td>
                              <strong>{ev.title}</strong>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {ev.category_name || `Danh mục #${ev.category_id}`}
                              </div>
                            </td>
                            <td>{ev.venue_name}</td>
                            <td style={{ fontSize: '0.82rem', fontWeight: 600, color: '#dc2626' }}>
                              {new Date(cancelTime).toLocaleString('vi-VN')}
                            </td>
                            <td style={{ fontSize: '0.82rem', maxWidth: 280 }}>
                              {ev.cancel_reason || 'Hủy theo quyết định từ Ban tổ chức'}
                            </td>
                            <td>
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '0.24rem 0.65rem',
                                  borderRadius: 999,
                                  fontSize: '0.76rem',
                                  fontWeight: 700,
                                  background: '#fef2f2',
                                  color: '#dc2626',
                                  border: '1px solid #fecaca'
                                }}
                              >
                                Đang hủy
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

        {/* ==================== MỤC 2: SƠ ĐỒ GHẾ & GIÁ VÉ ==================== */}
        {section === 'config' && (
          <>
            <div className="card" style={{ padding: '1rem 1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Sự kiện:</span>
                  <select
                    className="form-input"
                    style={{ minWidth: 280 }}
                    value={selectedEventId}
                    onChange={(e) => setSelectedEventId(Number(e.target.value))}
                  >
                    {myEvents.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        #{getEventSeq(ev)} — {ev.title}
                      </option>
                    ))}
                  </select>

                  {selectedEventDetail && (() => {
                    const st = getEventStatusBadge(selectedEventDetail);
                    return (
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '0.28rem 0.75rem',
                          borderRadius: 999,
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          background: st.bg,
                          color: st.color,
                          border: `1px solid ${st.border}`
                        }}
                      >
                        {st.label}
                      </span>
                    );
                  })()}

                  {selectedEventDetail && isEditable && (
                    <>
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
                        onClick={() => handleStatusChange(selectedEventDetail.id, 'PUBLISHED')}
                      >
                        Công bố
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
                        onClick={() => handleDeleteEvent(selectedEventDetail)}
                      >
                        Xóa sự kiện
                      </button>
                    </>
                  )}

                  {selectedEventDetail &&
                    !isEditable &&
                    getEventStatusBadge(selectedEventDetail).key !== 'COMPLETED' &&
                    selectedEventDetail.status !== 'CANCELLED' && (
                      <button
                        type="button"
                        className="btn btn-danger"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
                        onClick={() => openCancelModal(selectedEventDetail)}
                      >
                        Hủy
                      </button>
                    )}
                </div>

                <div style={{ display: 'flex', gap: '0.35rem', background: 'var(--bg-page)', padding: 4, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <button
                    type="button"
                    className={`portal-switch-btn ${configTab === 'zones' ? 'active' : ''}`}
                    onClick={() => setConfigTab('zones')}
                  >
                    Sơ đồ ghế
                  </button>
                  <button
                    type="button"
                    className={`portal-switch-btn ${configTab === 'tickets' ? 'active' : ''}`}
                    onClick={() => setConfigTab('tickets')}
                  >
                    Hạng vé
                  </button>
                </div>
              </div>
            </div>

            {selectedEventDetail && !isEditable && (
              <div
                className="alert"
                style={{
                  background: '#fffbeb',
                  color: '#92400e',
                  border: '1px solid #fcd34d',
                  marginBottom: '1rem'
                }}
              >
                Sơ đồ và giá vé đã khóa do sự kiện đã công bố.
              </div>
            )}

            {selectedEventId && configTab === 'zones' && (
              <div style={{ display: 'grid', gridTemplateColumns: isEditable ? '320px 1fr' : '1fr', gap: '1.25rem', alignItems: 'start' }}>
                {isEditable && (
                  <div className="card">
                    <div className="card-header">
                      <span className="card-title">Thêm Khu vực</span>
                    </div>
                    <form onSubmit={handleCreateZone}>
                      <div className="form-group">
                        <label className="form-label">Tên Khu vực</label>
                        <input
                          type="text"
                          required
                          className="form-input"
                          placeholder="VD: Khán đài A"
                          value={zoneName}
                          onChange={(e) => setZoneName(e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Loại Khu vực</label>
                        <select
                          className="form-input"
                          value={zoneType}
                          onChange={(e) => setZoneType(e.target.value)}
                        >
                          <option value="SEATED">Ghế ngồi</option>
                          <option value="STANDING">Khu đứng</option>
                        </select>
                      </div>

                      {zoneType === 'SEATED' ? (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }} className="form-group">
                            <div>
                              <label className="form-label">Số hàng ghế</label>
                              <input
                                type="number"
                                min="1"
                                max="26"
                                required
                                className="form-input"
                                value={zoneRows}
                                onChange={(e) => setZoneRows(e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="form-label">Số ghế mỗi hàng</label>
                              <input
                                type="number"
                                min="1"
                                max="50"
                                required
                                className="form-input"
                                value={zoneCols}
                                onChange={(e) => setZoneCols(e.target.value)}
                              />
                            </div>
                          </div>
                          <div className="form-group">
                            <label className="form-label">Hạng ghế mặc định</label>
                            <select
                              className="form-input"
                              value={zoneDefaultTier}
                              onChange={(e) => setZoneDefaultTier(e.target.value)}
                            >
                              <option value="STANDARD">Ghế Thường</option>
                              <option value="VIP">Ghế VIP</option>
                              <option value="STUDENT">Ghế Sinh viên</option>
                            </select>
                          </div>
                        </>
                      ) : (
                        <div className="form-group">
                          <label className="form-label">Tổng sức chứa</label>
                          <input
                            type="number"
                            min="1"
                            required
                            className="form-input"
                            value={zoneCapacity}
                            onChange={(e) => setZoneCapacity(e.target.value)}
                          />
                        </div>
                      )}

                      <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={zoneLoading}>
                        {zoneLoading ? 'Đang tạo...' : '+ Tạo Khu vực'}
                      </button>
                    </form>
                  </div>
                )}

                <div className="card" style={{ userSelect: 'none' }}>
                  <div className="card-header" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div>
                      <span className="card-title">Sơ đồ Chỗ ngồi</span>
                      {isEditable && (
                        <p style={{ fontSize: '0.77rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          Kéo chuột để tô vùng ghế hoặc chọn đầu Hàng/Cột.
                        </p>
                      )}
                    </div>
                    {isEditable && (
                      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <select
                          className="form-input"
                          style={{ width: 190, padding: '0.32rem 0.6rem', fontSize: '0.8rem', fontWeight: 600 }}
                          value={brushMode}
                          onChange={(e) => setBrushMode(e.target.value)}
                        >
                          <option value="DISABLE">Bôi lối đi / Cột chắn</option>
                          <option value="ENABLE">Khôi phục ghế</option>
                          <option value="VIP">Đổi ghế VIP</option>
                          <option value="STANDARD">Đổi ghế Thường</option>
                          <option value="STUDENT">Đổi ghế SV</option>
                        </select>

                        {totalPendingSeats > 0 && (
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ padding: '0.35rem 0.85rem', fontSize: '0.8rem' }}
                            disabled={savingSeats}
                            onClick={handleSaveSeatMap}
                          >
                            {savingSeats ? 'Đang lưu...' : `Lưu (${totalPendingSeats})`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {seatMapZones.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                      Chưa có khu vực nào cho sự kiện này.
                    </div>
                  ) : (
                    seatMapZones.map((zone) => {
                      const colsCount = zone.grid_cols || 10;
                      const rowsCount = zone.grid_rows || Math.ceil((zone.seats?.length || 0) / colsCount);
                      const zoneHasPending = Object.keys(pendingZoneEdits[zone.id] || {}).length > 0;

                      return (
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
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
                            <div>
                              <strong>{cleanName(zone.name)}</strong>
                              <span style={{ marginLeft: '0.75rem', color: 'var(--text-secondary)' }}>
                                Sức chứa khả dụng: <strong>{zone.total_capacity}</strong> chỗ
                              </span>
                            </div>

                            {isEditable && (
                              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                {zone.zone_type === 'SEATED' && (
                                  <>
                                    <button
                                      type="button"
                                      className="btn btn-outline"
                                      style={{ padding: '0.22rem 0.55rem', fontSize: '0.74rem' }}
                                      onClick={() => applyBrushToSeats(zone.id, zone.seats)}
                                    >
                                      Tô tất cả
                                    </button>
                                    {zoneHasPending && (
                                      <button
                                        type="button"
                                        className="btn btn-outline"
                                        style={{ padding: '0.22rem 0.55rem', fontSize: '0.74rem' }}
                                        onClick={() => {
                                          const next = { ...pendingZoneEdits };
                                          delete next[zone.id];
                                          setPendingZoneEdits(next);
                                        }}
                                      >
                                        Hoàn tác
                                      </button>
                                    )}
                                  </>
                                )}
                                <button
                                  type="button"
                                  className="btn btn-danger"
                                  style={{ padding: '0.22rem 0.55rem', fontSize: '0.74rem' }}
                                  onClick={() => handleDeleteZone(zone)}
                                >
                                  Xóa
                                </button>
                              </div>
                            )}
                          </div>

                          {zone.zone_type === 'STANDING' ? (
                            <div style={{ padding: '1rem', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 6, background: '#fff', fontSize: '0.84rem' }}>
                              Khu đứng tự do — Sức chứa: <strong>{zone.total_capacity}</strong> vé
                            </div>
                          ) : (
                            <div style={{ overflowX: 'auto' }}>
                              {/* Thanh bấm chọn nhanh theo Cột khi đang ở chế độ chỉnh sửa */}
                              {isEditable && (
                                <div
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: `46px repeat(${colsCount}, minmax(40px, 1fr))`,
                                    gap: '0.35rem',
                                    marginBottom: '0.35rem'
                                  }}
                                >
                                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
                                    Hàng\Cột
                                  </div>
                                  {Array.from({ length: colsCount }).map((_, cIdx) => (
                                    <button
                                      key={cIdx}
                                      type="button"
                                      title={`Tô toàn bộ cột ${cIdx + 1}`}
                                      onClick={() =>
                                        applyBrushToSeats(
                                          zone.id,
                                          zone.seats.filter((s) => s.col_index === cIdx)
                                        )
                                      }
                                      style={{
                                        padding: '0.2rem 0.1rem',
                                        fontSize: '0.68rem',
                                        fontWeight: 700,
                                        borderRadius: 4,
                                        border: '1px dashed #cbd5e1',
                                        background: '#f8fafc',
                                        color: '#475569',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      C{String(cIdx + 1).padStart(2, '0')}
                                    </button>
                                  ))}
                                </div>
                              )}

                              {/* Lưới ghế theo từng hàng */}
                              {Array.from({ length: rowsCount }).map((_, rIdx) => {
                                const rowSeats = zone.seats.filter((s) => s.row_index === rIdx);
                                const rowCode = rowSeats[0]?.row_code || String.fromCharCode(65 + rIdx);
                                return (
                                  <div
                                    key={rIdx}
                                    style={{
                                      display: 'grid',
                                      gridTemplateColumns: isEditable
                                        ? `46px repeat(${colsCount}, minmax(40px, 1fr))`
                                        : `repeat(${colsCount}, minmax(40px, 1fr))`,
                                      gap: '0.35rem',
                                      marginBottom: '0.35rem'
                                    }}
                                  >
                                    {isEditable && (
                                      <button
                                        type="button"
                                        title={`Tô toàn bộ hàng ${rowCode}`}
                                        onClick={() => applyBrushToSeats(zone.id, rowSeats)}
                                        style={{
                                          padding: '0.25rem 0.2rem',
                                          fontSize: '0.7rem',
                                          fontWeight: 700,
                                          borderRadius: 4,
                                          border: '1px dashed #cbd5e1',
                                          background: '#f8fafc',
                                          color: '#334155',
                                          cursor: 'pointer'
                                        }}
                                      >
                                        Hàng {rowCode}
                                      </button>
                                    )}

                                    {rowSeats.map((seat) => {
                                      const inDrag = isSeatInDragBox(zone.id, seat);
                                      return (
                                        <button
                                          key={seat.id}
                                          type="button"
                                          disabled={!isEditable}
                                          onMouseDown={(e) => handleSeatMouseDown(e, zone, seat)}
                                          onMouseEnter={() => handleSeatMouseEnter(zone, seat)}
                                          style={{
                                            ...getSeatBadgeStyle(zone.id, seat),
                                            padding: '0.32rem 0.2rem',
                                            borderRadius: 4,
                                            fontSize: '0.72rem',
                                            fontWeight: 600,
                                            cursor: isEditable ? 'crosshair' : 'default',
                                            boxShadow: inDrag ? '0 0 0 2px #2563eb' : 'none',
                                            transform: inDrag ? 'scale(0.95)' : 'none',
                                            transition: 'transform 0.05s ease'
                                          }}
                                        >
                                          {seat.seat_code}
                                        </button>
                                      );
                                    })}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {selectedEventId && configTab === 'tickets' && (() => {
              const currentSelectedZone = seatMapZones.find((z) => Number(z.id) === Number(ttZoneId));
              const currentZoneSeats = currentSelectedZone?.seats || [];
              const currentActiveSeats = currentZoneSeats.filter((s) => !s.is_disabled);
              const vipCount = currentActiveSeats.filter((s) => s.seat_tier === 'VIP').length;
              const stdCount = currentActiveSeats.filter((s) => s.seat_tier === 'STANDARD' || !s.seat_tier).length;
              const stuCount = currentActiveSeats.filter((s) => s.seat_tier === 'STUDENT').length;

              return (
                <div>
                  {/* Bảng kiểm tra tiến độ đáp ứng ràng buộc Hạng vé theo Sơ đồ chỗ ngồi */}
                  <div className="card" style={{ marginBottom: '1.25rem', padding: '1.1rem 1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <span className="card-title" style={{ fontSize: '0.98rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span>📋</span> <strong>Ràng buộc phát hành vé theo Sơ đồ chỗ ngồi</strong>
                      </span>
                      <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                        Quy tắc: Khi tạo bao nhiêu phân loại chỗ ngồi thì phải tạo <strong>tối thiểu bấy nhiêu loại vé tương ứng</strong> (có thể tạo thêm vé Early Bird, Sinh viên...)
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '0.85rem' }}>
                      {seatMapZones.map((z) => {
                        const zTts = selectedEventDetail?.ticket_types?.filter((tt) => tt.zone_id === z.id) || [];
                        const isSeated = z.zone_type === 'SEATED';
                        let tierCounts = {};
                        let totalActive = 0;
                        if (isSeated) {
                          const activeSeats = (z.seats || []).filter((s) => !s.is_disabled);
                          totalActive = activeSeats.length;
                          activeSeats.forEach((s) => {
                            const t = s.seat_tier || 'STANDARD';
                            tierCounts[t] = (tierCounts[t] || 0) + 1;
                          });
                        }
                        const distinctTiers = Object.keys(tierCounts);
                        const isQualified = isSeated
                          ? zTts.length >= distinctTiers.length && distinctTiers.length > 0
                          : zTts.length >= 1;
                        const totalQty = zTts.reduce((sum, item) => sum + (item.total_quantity || 0), 0);

                        return (
                          <div
                            key={z.id}
                            style={{
                              padding: '0.85rem 1rem',
                              borderRadius: 8,
                              border: isQualified ? '1px solid #bbf7d0' : '1px solid #fed7aa',
                              background: isQualified ? '#f0fdf4' : '#fffbeb'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                              <strong style={{ fontSize: '0.88rem' }}>{cleanName(z.name)}</strong>
                              <span
                                className={`badge ${isQualified ? 'badge-APPROVED' : 'badge-PENDING'}`}
                                style={{ fontSize: '0.7rem' }}
                              >
                                {isQualified ? '✓ Đạt yêu cầu' : '⚠️ Cần thêm loại vé'}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.78rem', color: '#475569', marginBottom: '0.45rem' }}>
                              {isSeated ? (
                                <span>
                                  Phân loại chỗ ngồi: {distinctTiers.map(t => `${t === 'VIP' ? 'Ghế VIP ⭐' : t === 'STANDARD' ? 'Ghế Thường' : 'Ghế SV'}: ${tierCounts[t]} chỗ`).join(' • ')} (Tổng {totalActive} ghế)
                                </span>
                              ) : (
                                <span>Khu vực đứng tự do (Sức chứa {z.total_capacity} chỗ)</span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.76rem', color: isQualified ? '#15803d' : '#b45309', fontWeight: 600 }}>
                              {isSeated
                                ? `Đã tạo ${zTts.length} loại vé (Tổng ${totalQty} vé) / Yêu cầu tối thiểu ${distinctTiers.length} loại vé cho ${distinctTiers.length} phân loại chỗ ngồi.`
                                : `Đã tạo ${zTts.length} loại vé (Tổng ${totalQty} vé) / Yêu cầu tối thiểu 1 loại vé.`}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: isEditable ? '360px 1fr' : '1fr', gap: '1.25rem', alignItems: 'start' }}>
                    {isEditable && (
                      <div className="card">
                        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className="card-title">
                            {editingTicketType ? `Sửa: ${cleanName(editingTicketType.name)}` : 'Thêm Hạng vé'}
                          </span>
                          {editingTicketType && (
                            <button
                              type="button"
                              className="btn btn-outline"
                              style={{ padding: '0.2rem 0.55rem', fontSize: '0.74rem' }}
                              onClick={handleCancelEditTicketType}
                            >
                              Hủy sửa
                            </button>
                          )}
                        </div>
                        <form onSubmit={handleCreateTicketType}>
                          <div className="form-group">
                            <label className="form-label">Khu vực áp dụng</label>
                            <select
                              required
                              className="form-input"
                              value={ttZoneId}
                              disabled={Boolean(editingTicketType)}
                              onChange={(e) => setTtZoneId(e.target.value)}
                            >
                              <option value="">-- Chọn khu vực --</option>
                              {seatMapZones.map((z) => (
                                <option key={z.id} value={z.id}>
                                  {cleanName(z.name)} — {z.total_capacity} chỗ ({z.zone_type === 'SEATED' ? 'Ghế ngồi' : 'Vé đứng'})
                                </option>
                              ))}
                            </select>

                            {/* Gợi ý nhanh điền loại vé tương ứng cho từng phân loại chỗ ngồi */}
                            {!editingTicketType && currentSelectedZone?.zone_type === 'SEATED' && (
                              <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#f8fafc', borderRadius: 6, border: '1px dashed #cbd5e1' }}>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>
                                  💡 GỢI Ý THEO HẠNG GHẾ:
                                </div>
                                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                  {vipCount > 0 && (
                                    <button
                                      type="button"
                                      className="btn btn-outline"
                                      style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', background: '#fffbeb', borderColor: '#f59e0b', color: '#b45309' }}
                                      onClick={() => {
                                        setTtName(`Vé VIP - ${cleanName(currentSelectedZone.name)}`);
                                        setTtTotalQty(vipCount);
                                        setTtBasePrice(500000);
                                      }}
                                    >
                                      ⭐ Vé VIP ({vipCount} vé)
                                    </button>
                                  )}
                                  {stdCount > 0 && (
                                    <button
                                      type="button"
                                      className="btn btn-outline"
                                      style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', background: '#ffffff', borderColor: '#cbd5e1', color: '#334155' }}
                                      onClick={() => {
                                        setTtName(`Vé Ghế Thường - ${cleanName(currentSelectedZone.name)}`);
                                        setTtTotalQty(stdCount);
                                        setTtBasePrice(300000);
                                      }}
                                    >
                                      🪑 Ghế Thường ({stdCount} vé)
                                    </button>
                                  )}
                                  {stuCount > 0 && (
                                    <button
                                      type="button"
                                      className="btn btn-outline"
                                      style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', background: '#eff6ff', borderColor: '#93c5fd', color: '#1d4ed8' }}
                                      onClick={() => {
                                        setTtName(`Vé Ghế Sinh Viên - ${cleanName(currentSelectedZone.name)}`);
                                        setTtTotalQty(stuCount);
                                        setTtBasePrice(150000);
                                        setTtStudentDomain('@tdtu.edu.vn');
                                      }}
                                    >
                                      🎓 Ghế SV ({stuCount} vé)
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="form-group">
                            <label className="form-label">Tên Hạng vé</label>
                            <input
                              type="text"
                              required
                              className="form-input"
                              placeholder="Vé VIP / Vé Sinh viên"
                              value={ttName}
                              onChange={(e) => setTtName(e.target.value)}
                            />
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '0.6rem' }} className="form-group">
                            <div>
                              <label className="form-label">Giá chuẩn</label>
                              <input
                                type="number"
                                min="0"
                                required
                                className="form-input"
                                placeholder="300000"
                                value={ttBasePrice}
                                onChange={(e) => setTtBasePrice(e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="form-label">Số lượng</label>
                              <input
                                type="number"
                                min="1"
                                required
                                className="form-input"
                                value={ttTotalQty}
                                onChange={(e) => setTtTotalQty(e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="form-label">Tối đa/đơn</label>
                              <input
                                type="number"
                                min="1"
                                max="20"
                                required
                                className="form-input"
                                value={ttMaxPerOrder}
                                onChange={(e) => setTtMaxPerOrder(e.target.value)}
                              />
                            </div>
                          </div>

                          {/* Thời gian mở bán & kết thúc bán vé (Mặc định kết thúc trước khi sự kiện diễn ra) */}
                          <div style={{ padding: '0.65rem', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0', marginBottom: '0.85rem' }}>
                            <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.45rem' }}>
                              ⏰ Thời gian bán vé (Mặc định trước giờ sự kiện)
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.5rem' }}>
                              <div>
                                <label className="form-label" style={{ fontSize: '0.74rem' }}>Mở bán từ</label>
                                <input
                                  type="datetime-local"
                                  required
                                  className="form-input"
                                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.5rem' }}
                                  value={ttSaleStartTime}
                                  max={selectedEventDetail?.start_time ? toLocalInputDateTime(selectedEventDetail.start_time) : undefined}
                                  onChange={(e) => setTtSaleStartTime(e.target.value)}
                                />
                              </div>
                              <div>
                                <label className="form-label" style={{ fontSize: '0.74rem' }}>Kết thúc bán lúc</label>
                                <input
                                  type="datetime-local"
                                  required
                                  className="form-input"
                                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.5rem' }}
                                  value={ttSaleEndTime}
                                  max={selectedEventDetail?.start_time ? toLocalInputDateTime(selectedEventDetail.start_time) : undefined}
                                  onChange={(e) => setTtSaleEndTime(e.target.value)}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="form-group">
                            <label className="form-label">Đuôi Email Sinh viên</label>
                            <input
                              type="text"
                              className="form-input"
                              placeholder="@tdtu.edu.vn"
                              value={ttStudentDomain}
                              onChange={(e) => setTtStudentDomain(e.target.value)}
                            />
                          </div>

                          {!editingTicketType && (
                            <>
                              <div className="form-group">
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
                                  <input
                                    type="checkbox"
                                    checked={enableEarlyBird}
                                    onChange={(e) => setEnableEarlyBird(e.target.checked)}
                                  />
                                  Áp dụng giá ưu đãi theo thời gian
                                </label>
                              </div>

                              {enableEarlyBird && (
                                <div style={{ padding: '0.75rem', background: 'var(--bg-page)', borderRadius: 6, border: '1px solid var(--border)', marginBottom: '1rem' }}>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <input
                                      type="text"
                                      className="form-input"
                                      placeholder="Tên đợt ưu đãi"
                                      value={ruleName}
                                      onChange={(e) => setRuleName(e.target.value)}
                                    />
                                    <input
                                      type="number"
                                      min="0"
                                      className="form-input"
                                      placeholder="Giá ưu đãi"
                                      value={ruleDiscountPrice}
                                      onChange={(e) => setRuleDiscountPrice(e.target.value)}
                                    />
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                    <input
                                      type="datetime-local"
                                      className="form-input"
                                      value={ruleStartDate}
                                      onChange={(e) => setRuleStartDate(e.target.value)}
                                    />
                                    <input
                                      type="datetime-local"
                                      className="form-input"
                                      value={ruleEndDate}
                                      onChange={(e) => setRuleEndDate(e.target.value)}
                                    />
                                  </div>
                                </div>
                              )}
                            </>
                          )}

                          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={ttLoading || !ttZoneId}>
                            {ttLoading ? 'Đang lưu...' : editingTicketType ? 'Lưu cập nhật Hạng vé' : '+ Lưu Hạng vé'}
                          </button>
                        </form>
                      </div>
                    )}

                <div className="card">
                  <div className="card-header">
                    <span className="card-title">Danh sách Hạng vé</span>
                  </div>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Tên hạng vé</th>
                        <th>Khu vực</th>
                        <th>Giá áp dụng</th>
                        <th>Số lượng</th>
                        <th>Thời gian bán vé</th>
                        <th>Điều kiện mua</th>
                        {isEditable && <th style={{ textAlign: 'right' }}>Thao tác</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {!selectedEventDetail?.ticket_types?.length ? (
                        <tr>
                          <td colSpan={isEditable ? 7 : 6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                            Chưa có hạng vé nào cho sự kiện này.
                          </td>
                        </tr>
                      ) : (
                        selectedEventDetail.ticket_types.map((tt) => {
                          const saleStart = tt.sale_start_time || tt.created_at;
                          const saleEnd = tt.sale_end_time || selectedEventDetail?.start_time;
                          return (
                            <tr key={tt.id}>
                              <td><strong>{cleanName(tt.name)}</strong></td>
                              <td>Khu vực #{tt.zone_id}</td>
                              <td>
                                <strong style={{ color: 'var(--accent-blue)' }}>
                                  {tt.current_price != null ? `${Number(tt.current_price).toLocaleString('vi-VN')} đ` : '—'}
                                </strong>
                                {tt.active_rule_name && (
                                  <span className="badge badge-APPROVED" style={{ marginLeft: 6 }}>
                                    {cleanName(tt.active_rule_name)}
                                  </span>
                                )}
                              </td>
                              <td>{tt.total_quantity} vé</td>
                              <td style={{ fontSize: '0.76rem' }}>
                                <div>Mở: {saleStart ? new Date(saleStart).toLocaleString('vi-VN') : '—'}</div>
                                <div style={{ color: 'var(--text-muted)' }}>
                                  Đóng: {saleEnd ? new Date(saleEnd).toLocaleString('vi-VN') : '—'}
                                </div>
                              </td>
                              <td style={{ fontSize: '0.8rem' }}>
                                Tối đa {tt.max_per_order} vé/đơn
                                {tt.student_email_domain ? ` • Email ${tt.student_email_domain}` : ''}
                              </td>
                              {isEditable && (
                                <td style={{ textAlign: 'right' }}>
                                  <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                                    <button
                                      type="button"
                                      className="btn btn-outline"
                                      style={{ padding: '0.26rem 0.6rem', fontSize: '0.75rem' }}
                                      onClick={() => handleStartEditTicketType(tt)}
                                    >
                                      Sửa
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-danger"
                                      style={{ padding: '0.26rem 0.6rem', fontSize: '0.75rem' }}
                                      onClick={() => handleDeleteTicketType(tt)}
                                    >
                                      Xóa
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })()}
          </>
        )}

        {/* ==================== MỤC 3: QUẢN LÝ & PHÂN CÔNG NHÂN SỰ ==================== */}
        {section === 'staff' && (
          <>
            <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.25rem' }}>
              <button
                type="button"
                className={`portal-switch-btn ${staffTab === 'list' ? 'active' : ''}`}
                onClick={() => setStaffTab('list')}
              >
                Nhân viên ({managedStaff.length})
              </button>
              <button
                type="button"
                className={`portal-switch-btn ${staffTab === 'assign' ? 'active' : ''}`}
                onClick={() => setStaffTab('assign')}
              >
                Phân công
              </button>
            </div>

            {staffTab === 'list' ? (
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Danh sách Nhân viên</span>
                </div>

                <form onSubmit={handleCreateStaff} style={{ marginBottom: '1.25rem', padding: '1rem', background: 'var(--bg-page)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '0.75rem', alignItems: 'end' }}>
                    <div>
                      <label className="form-label">Họ và tên</label>
                      <input
                        type="text"
                        required
                        className="form-input"
                        placeholder="Nhập họ tên"
                        value={newStaffName}
                        onChange={(e) => setNewStaffName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="form-label">Email</label>
                      <input
                        type="email"
                        required
                        className="form-input"
                        placeholder="staff@domain.com"
                        value={newStaffEmail}
                        onChange={(e) => setNewStaffEmail(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="form-label">Mật khẩu</label>
                      <input
                        type="password"
                        required
                        minLength={6}
                        className="form-input"
                        placeholder="Tối thiểu 6 ký tự"
                        value={newStaffPassword}
                        onChange={(e) => setNewStaffPassword(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="form-label">Điện thoại</label>
                      <input
                        type="tel"
                        className="form-input"
                        placeholder="Số điện thoại"
                        value={newStaffPhone}
                        onChange={(e) => setNewStaffPhone(e.target.value)}
                      />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={createLoading}>
                      {createLoading ? 'Đang thêm...' : '+ Thêm'}
                    </button>
                  </div>
                </form>

                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Mã NV</th>
                      <th>Họ và tên</th>
                      <th>Email</th>
                      <th>Điện thoại</th>
                      <th style={{ textAlign: 'right' }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {managedStaff.length === 0 ? (
                      <tr>
                        <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>
                          Chưa có nhân viên nào trong danh sách.
                        </td>
                      </tr>
                    ) : (
                      [...managedStaff]
                        .sort((a, b) => a.id - b.id)
                        .map((s) => (
                          <tr key={s.id}>
                            <td>
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '0.2rem 0.55rem',
                                  background: '#eff6ff',
                                  color: '#1d4ed8',
                                  fontWeight: 700,
                                  fontSize: '0.8rem',
                                  borderRadius: 6,
                                  fontFamily: 'monospace',
                                  border: '1px solid #bfdbfe'
                                }}
                              >
                                #{getStaffSeq(s)}
                              </span>
                            </td>
                            <td><strong>{cleanName(s.full_name)}</strong></td>
                            <td><code>{s.email}</code></td>
                            <td>{s.phone || '—'}</td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                type="button"
                                className="btn btn-danger"
                                style={{ padding: '0.28rem 0.65rem', fontSize: '0.76rem' }}
                                onClick={() => handleDeleteStaff(s)}
                              >
                                Xóa
                              </button>
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Phân công Nhân sự theo Sự kiện</span>
                </div>

                <form onSubmit={handleAssignStaff} style={{ marginBottom: '1.25rem', padding: '1rem', background: 'var(--bg-page)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1fr auto', gap: '0.75rem', alignItems: 'end' }}>
                    <div>
                      <label className="form-label">Sự kiện</label>
                      <select
                        className="form-input"
                        value={targetEventId}
                        onChange={(e) => {
                          const id = Number(e.target.value);
                          setTargetEventId(id);
                          const found = myEvents.find((ev) => ev.id === id);
                          if (found) setTargetEventTitle(found.title);
                        }}
                      >
                        {myEvents.map((ev) => (
                          <option key={ev.id} value={ev.id}>
                            #{getEventSeq(ev)} — {ev.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Nhân viên</label>
                      <select
                        required
                        className="form-input"
                        value={staffEmail}
                        onChange={(e) => setStaffEmail(e.target.value)}
                        disabled={managedStaff.length === 0}
                      >
                        {managedStaff.length === 0 ? (
                          <option value="">-- Chưa có nhân viên --</option>
                        ) : (
                          [...managedStaff]
                            .sort((a, b) => a.id - b.id)
                            .map((s) => (
                              <option key={s.id} value={s.email}>
                                #{getStaffSeq(s)} — {cleanName(s.full_name)} ({s.email})
                              </option>
                            ))
                        )}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Vị trí trực</label>
                      <input
                        type="text"
                        required
                        className="form-input"
                        placeholder="Soát vé Cổng A"
                        value={staffRoleTitle}
                        onChange={(e) => setStaffRoleTitle(e.target.value)}
                      />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={assignLoading || managedStaff.length === 0}>
                      {assignLoading ? 'Đang lưu...' : 'Phân công'}
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center', marginTop: '0.75rem', fontSize: '0.82rem' }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Quyền hạn:</span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={permissions.includes('CHECKIN')}
                        onChange={() => togglePermission('CHECKIN')}
                      />
                      Soát vé
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={permissions.includes('VIEW_ATTENDEES')}
                        onChange={() => togglePermission('VIEW_ATTENDEES')}
                      />
                      Tra cứu khách
                    </label>
                  </div>
                </form>

                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Mã NV</th>
                      <th>Họ và tên</th>
                      <th>Email</th>
                      <th>Vị trí trực</th>
                      <th>Quyền hạn</th>
                      <th style={{ textAlign: 'right' }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignedStaffList.length === 0 ? (
                      <tr>
                        <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>
                          Chưa có nhân sự nào được phân công tại Sự kiện #{getEventSeq(myEvents.find((e) => e.id === targetEventId)) || targetEventId}.
                        </td>
                      </tr>
                    ) : (
                      assignedStaffList.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '0.2rem 0.55rem',
                                background: '#eff6ff',
                                color: '#1d4ed8',
                                fontWeight: 700,
                                fontSize: '0.8rem',
                                borderRadius: 6,
                                fontFamily: 'monospace',
                                border: '1px solid #bfdbfe'
                              }}
                            >
                              #{s.org_staff_id || getStaffSeq(s.staff_user_id)}
                            </span>
                          </td>
                          <td><strong>{cleanName(s.staff_name)}</strong></td>
                          <td><code>{s.staff_email}</code></td>
                          <td>{cleanName(s.staff_role_title)}</td>
                          <td>
                            {s.permissions.map((p) => (
                              <span key={p} className="badge badge-STAFF" style={{ marginRight: 4 }}>{p}</span>
                            ))}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              type="button"
                              className="btn btn-danger"
                              style={{ padding: '0.28rem 0.65rem', fontSize: '0.76rem' }}
                              onClick={() => handleUnassignStaff(s)}
                            >
                              Gỡ
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ==================== MODAL XÁC THỰC HỦY SỰ KIỆN BẢO MẬT 3 LỚP ==================== */}
        {cancelModalEvent && (
          <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: 520 }}>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setCancelModalEvent(null)}
                aria-label="Đóng"
              >
                &times;
              </button>

              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#dc2626', marginBottom: '0.35rem' }}>
                Hủy sự kiện #{getEventSeq(cancelModalEvent)}
              </h2>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1rem' }}>
                Hệ thống sẽ hoàn tiền 100% cho khách mua vé. Vui lòng xác thực:
              </p>

              <form onSubmit={handleConfirmCancelEvent}>
                <div className="form-group">
                  <label className="form-label">1. Lý do hủy</label>
                  <input
                    type="text"
                    required
                    minLength={10}
                    className="form-input"
                    placeholder="Tối thiểu 10 ký tự"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">
                    2. Xác nhận tên sự kiện: <span style={{ color: '#dc2626' }}>{cancelModalEvent.title}</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder={cancelModalEvent.title}
                    value={cancelConfirmTitle}
                    onChange={(e) => setCancelConfirmTitle(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">3. Mã OTP</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      className="form-input mono"
                      placeholder="Mã 6 số"
                      value={cancelOtp}
                      onChange={(e) => setCancelOtp(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ whiteSpace: 'nowrap' }}
                      disabled={requestingOtp}
                      onClick={handleRequestCancelOtp}
                    >
                      {requestingOtp ? 'Đang gửi...' : 'Lấy mã OTP'}
                    </button>
                  </div>
                  {otpSentHint && (
                    <div style={{ marginTop: '0.35rem', fontSize: '0.78rem', color: '#166534', fontWeight: 600 }}>
                      {otpSentHint}
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">4. Mật khẩu của bạn</label>
                  <input
                    type="password"
                    required
                    className="form-input"
                    placeholder="Mật khẩu tài khoản"
                    value={cancelPassword}
                    onChange={(e) => setCancelPassword(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1.25rem' }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setCancelModalEvent(null)}
                  >
                    Đóng
                  </button>
                  <button
                    type="submit"
                    className="btn btn-danger"
                    disabled={
                      cancelSubmitting ||
                      cancelConfirmTitle.trim() !== cancelModalEvent.title.trim() ||
                      cancelOtp.trim().length !== 6 ||
                      !cancelPassword ||
                      cancelReason.trim().length < 10
                    }
                  >
                    {cancelSubmitting ? 'Đang hủy...' : 'Xác nhận Hủy'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
