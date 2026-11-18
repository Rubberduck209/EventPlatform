# BẢN MÔ TẢ CHI TIẾT CHỨC NĂNG CÁC SERVICES
### ĐỒ ÁN CUỐI KỲ SOA: NỀN TẢNG QUẢN LÝ SỰ KIỆN VÀ BÁN VÉ

---

## TỔNG QUAN NHANH: AI LÀM GÌ TRONG HỆ THỐNG?

| Service | Tên tiếng Việt | Trách nhiệm chính (Làm gì?) |
| :--- | :--- | :--- |
| **1. Identity Service** | Dịch vụ Người dùng & Phân quyền | Quản lý đăng ký/đăng nhập, phân 4 nhóm quyền (Customer, Organizer, Staff, Admin), duyệt hồ sơ ban tổ chức, gán nhân viên vào sự kiện. |
| **2. Event Service** | Dịch vụ Quản lý Sự kiện | Tạo và quản lý sự kiện, vẽ sơ đồ ghế (Grid Map), tạo khu đứng/ngồi, cài đặt các loại vé và bảng giá (Early Bird / Regular). |
| **3. Booking Service** | Dịch vụ Đặt vé & Giữ chỗ | Tiếp nhận đơn đặt vé, **tạm giữ ghế/vé trong 10 phút (TTL)**, chống bán lố vé (chống oversell), hủy đơn giải phóng chỗ nếu hết giờ chưa trả tiền. |
| **4. Payment Service** | Dịch vụ Thanh toán | Kết nối VNPay / Mock Gateway, nhận tiền, xử lý callback webhook, chống trừ tiền 2 lần (Idempotency), thực hiện hoàn tiền (Refund). |
| **5. Ticket Service** | Dịch vụ Vé điện tử & Check-in | Phát hành vé điện tử, tạo mã **QR có chữ ký số chống giả**, cho nhân viên quét mã QR check-in tại cổng và chặn quét trùng lặp. |
| **6. Notification Service** | Dịch vụ Thông báo | Tự động gửi Email thông báo khi: đặt vé thành công, thanh toán thành công, gửi vé QR, báo đổi giờ hoặc hủy sự kiện. |
| **7. Reporting Service** | Dịch vụ Báo cáo & Thống kê | Cung cấp số liệu Dashboard cho Ban tổ chức (đã bán bao nhiêu vé, doanh thu bao nhiêu, ai đã check-in), tính tiền đối soát sau sự kiện. |

---

## CHI TIẾT TỪNG SERVICE

---

### 1. IDENTITY SERVICE (Quản lý Tài khoản & Phân quyền)
Service này chịu trách nhiệm về người dùng và an ninh của toàn bộ hệ thống.

* **Nhiệm vụ cụ thể:**
  1. **Đăng ký & Đăng nhập:**
     * Cho phép Khách hàng (`Customer`) tự do đăng ký tài khoản bằng email và mật khẩu.
     * Cung cấp cơ chế đăng nhập, trả về JWT Token để các service khác xác thực người dùng.
  2. **Quản lý Ban tổ chức (`Organizer`):**
     * Tiếp nhận hồ sơ đăng ký mở tài khoản làm Ban tổ chức (gồm: tên công ty/tổ chức, mã số thuế, giấy phép kinh doanh).
     * Cung cấp giao diện/API cho Quản trị viên (`Admin`) kiểm duyệt, bấm Chấp thuận (`APPROVED`) hoặc Từ chối (`REJECTED`).
  3. **Phân công Nhân viên sự kiện (`Staff`):**
     * Ban tổ chức chọn nhân viên và gán vào một sự kiện cụ thể.
     * Cấp quyền chi tiết cho nhân viên đó: chỉ được quét vé check-in (`CHECKIN_ONLY`), hoặc chỉ xem danh sách người tham gia (`VIEW_ATTENDEES`).
* **Dữ liệu lưu trữ:** Danh sách người dùng, mật khẩu mã hóa, hồ sơ ban tổ chức, bảng phân công nhân viên theo sự kiện.

---

### 2. EVENT SERVICE (Quản lý Sự kiện & Sơ đồ Chỗ ngồi)
Đây là trung tâm thông tin của các sự kiện, nơi Ban tổ chức thiết kế và cấu hình toàn bộ nội dung sự kiện.

* **Nhiệm vụ cụ thể:**
  1. **Quản lý vòng đời sự kiện:**
     * Ban tổ chức tạo, sửa thông tin sự kiện (tên, mô tả, ảnh banner, thời gian bắt đầu/kết thúc, địa điểm tổ chức, chính sách hoàn vé).
     * Quản lý trạng thái sự kiện: Bản nháp (`DRAFT`) $\rightarrow$ Đã công bố (`PUBLISHED`) $\rightarrow$ Mở bán vé (`ON_SALE`) $\rightarrow$ Đang diễn ra $\rightarrow$ Kết thúc hoặc Bị hủy (`CANCELLED`).
  2. **Quản lý Sơ đồ chỗ ngồi (Seat Grid Map Editor):**
     * **Khu vực đứng (Standing):** Ban tổ chức chỉ cần nhập sức chứa tối đa (VD: khu Fanzone 1.000 người).
     * **Khu vực có ghế (Seated):** Ban tổ chức nhập số hàng $\times$ số cột ghế. Hệ thống tự vẽ lưới ghế (A01 đến J20). Ban tổ chức có thể:
       * Tô đen các vị trí không có ghế (lối đi, cột nhà, ghế hỏng) để khách không chọn được.
       * Phân màu từng khu vực ghế để gán với các loại vé khác nhau.
  3. **Cấu hình Loại vé & Quy tắc giá (Dynamic Pricing):**
     * Tạo các hạng vé: VIP, Standard, Student...
     * Ràng buộc: Vé Student chỉ cho phép người dùng có email đuôi trường học (VD: `@tdtu.edu.vn`) mua; mỗi đơn tối đa mua 4 vé.
     * Cài đặt giá vé đổi theo thời gian: Giá Early Bird bán rẻ hơn trong 10 ngày đầu, sau đó tự động chuyển sang giá Thường (Regular).
* **Dữ liệu lưu trữ:** Sự kiện, danh mục, khu vực (Zones), danh sách ghế và tọa độ ghế trên sơ đồ, các loại vé và bảng giá vé theo mốc thời gian.

---

### 3. BOOKING SERVICE (Đặt vé, Giữ chỗ & Điều phối Đơn hàng)
Đây là service "nóng" nhất, chịu trách nhiệm xử lý khi khách hàng ồ ạt vào săn vé, đảm bảo không bao giờ bị bán lố vé (oversell).

* **Nhiệm vụ cụ thể:**
  1. **Tiếp nhận đặt chỗ & Giữ chỗ 10 phút (TTL):**
     * Khi khách chọn ghế hoặc chọn số lượng vé và bấm "Đặt vé", service này tạo một đơn hàng ở trạng thái Chờ thanh toán (`PENDING_PAYMENT`).
     * Tạm khóa ghế/vé đó trong vòng đúng **10 phút**. Trong 10 phút này, người khác vào chọn sẽ thấy ghế đang bận.
  2. **Giải quyết tranh chấp khi nhiều người cùng chọn 1 ghế (Concurrency):**
     * Đảm bảo nếu 100 người cùng bấm chọn ghế A01 hoặc cùng bấm mua tấm vé cuối cùng, chỉ duy nhất 1 người thành công giữ được vé; 99 người còn lại nhận thông báo vé đã có người giữ.
  3. **Xử lý hết giờ (Timeout / Tự động hủy đơn):**
     * Sau 10 phút mà khách không thanh toán, service tự động hủy đơn và nhả ghế/vé về trạng thái còn trống để người khác mua.
  4. **Điều phối luồng Saga:**
     * Nhận tin thanh toán thành công $\rightarrow$ Chốt đơn Đã bán (`CONFIRMED`).
     * Nhận tin thanh toán lỗi $\rightarrow$ Hủy đơn, trả ghế lại kho.
* **Dữ liệu lưu trữ:** Bảng đơn đặt vé (`bookings`), danh sách chi tiết vé đã đặt (`booking_items`), bảng trạng thái khóa giữ chỗ (`seat_reservations`), bảng đếm tồn kho vé đứng (`ticket_inventory`).

---

### 4. PAYMENT SERVICE (Xử lý Thanh toán & Hoàn tiền)
Service chuyên biệt chịu trách nhiệm liên kết với ngân hàng, cổng thanh toán và tiền tệ.

* **Nhiệm vụ cụ thể:**
  1. **Tạo phiên thanh toán:**
     * Tiếp nhận mã đơn và số tiền cần thu từ Booking Service.
     * Tạo đường link thanh toán chuyển hướng sang VNPay Sandbox hoặc Cổng thanh toán giả lập (Mock Payment Gateway).
  2. **Tiếp nhận Webhook / Callback kết quả:**
     * Nhận kết quả trả về từ cổng thanh toán (Thành công / Thất bại).
     * Kiểm tra chữ ký bảo mật từ VNPay để đảm bảo kết quả không bị can thiệp làm giả số tiền.
  3. **Chống thanh toán trùng lặp (Idempotency):**
     * Nếu cổng thanh toán gửi lặp callback nhiều lần hoặc mạng bị trễ, service dùng `idempotency_key` để đảm bảo chỉ xử lý đúng 1 lần, không bị ghi nhận 2 lần tiền.
  4. **Xử lý Hoàn tiền (Refund):**
     * Khách hàng hủy vé hợp lệ theo chính sách hoặc Ban tổ chức hủy sự kiện $\rightarrow$ Service thực hiện lệnh hoàn tiền lại cho khách hàng.
* **Dữ liệu lưu trữ:** Lịch sử các giao dịch thanh toán (`payments`), lịch sử hoàn tiền (`payment_refunds`), bảng kiểm tra khóa trùng lặp (`idempotency_records`).

---

### 5. TICKET SERVICE (Phát hành Vé điện tử & Quét Check-in)
Chịu trách nhiệm quản lý vòng đời của chiếc vé sau khi đã trả tiền cho đến khi khách vào cổng sự kiện.

* **Nhiệm vụ cụ thể:**
  1. **Phát hành vé điện tử (E-Ticket):**
     * Sau khi đơn hàng được trả tiền xong, service này lập tức tạo vé điện tử tương ứng cho từng ghế/người.
  2. **Tạo mã QR có chữ ký số (Chống làm giả vé):**
     * Ghép thông tin (Mã vé + Mã sự kiện + Số ghế + Tên người sở hữu) và ký bằng chữ ký bí mật (HMAC-SHA256). Người ngoài tự in mã QR giả mạo sẽ bị phát hiện ngay khi quét.
  3. **Xử lý Check-in tại cổng sự kiện:**
     * Nhân viên dùng điện thoại/máy quét để quét mã QR của khách.
     * Kiểm tra vé có đúng sự kiện không, đã thanh toán chưa, chữ ký có đúng không.
     * Chuyển trạng thái vé từ Đã phát hành (`ISSUED`) sang Đã tham dự (`CHECKED_IN`).
  4. **Chống Check-in đồng thời (Race Condition):**
     * Nếu 2 nhân viên cùng quét 1 mã vé tại 2 cổng cùng 1 tích tắc, hệ thống đảm bảo chỉ 1 người báo thành công, người kia sẽ bị báo ngay: "Vé này đã check-in rồi!".
  5. **Quản lý chuyển nhượng / Hủy vé:**
     * Khách hủy vé $\rightarrow$ Chuyển vé sang Đã hủy (`CANCELLED`).
     * Khách sang nhượng vé $\rightarrow$ Vô hiệu hóa mã QR cũ, cấp mã QR mới cho người nhận.
* **Dữ liệu lưu trữ:** Danh sách vé điện tử (`tickets`), lịch sử tất cả các lượt quét tại cổng (`checkin_logs`), lịch sử chuyển nhượng vé.

---

### 6. NOTIFICATION SERVICE (Gửi Email & Thông báo Đa kênh)
Service làm việc âm thầm ở hậu trường, chuyên lắng nghe tin tức từ các service khác để gửi thông báo cho người dùng.

* **Nhiệm vụ cụ thể:**
  1. **Quản lý mẫu thông báo (Templates):**
     * Lưu trữ các mẫu email HTML đẹp mắt: Mẫu báo giữ chỗ, Mẫu báo thanh toán thành công, Mẫu đính kèm vé QR, Mẫu báo đổi lịch diễn, Mẫu báo hủy sự kiện.
  2. **Tự động gửi thông báo theo sự kiện:**
     * Khách đặt vé xong $\rightarrow$ Gửi email nhắc 10 phút thanh toán.
     * Thanh toán xong $\rightarrow$ Gửi email đính kèm vé điện tử và mã QR.
     * Ban tổ chức đổi giờ sự kiện hoặc hủy sự kiện $\rightarrow$ Tự động gửi email thông báo hàng loạt cho toàn bộ người đã mua vé.
     * Gửi email nhắc nhở trước 24 giờ diễn ra sự kiện (kèm file lịch `.ics`).
  3. **Cơ chế tự thử lại (Retry):**
     * Nếu gửi mail bị lỗi mạng, service sẽ tự động xếp hàng thử lại nhiều lần trước khi ghi nhận lỗi.
* **Dữ liệu lưu trữ:** Mẫu thông báo (`notification_templates`), nhật ký gửi thông báo (`notifications`) kèm trạng thái gửi (Thành công, Thất bại, Số lần thử lại).

---

### 7. REPORTING SERVICE (Báo cáo Thống kê & Đối soát Tài chính)
Service này phục vụ việc đọc số liệu phân tích, giúp Ban tổ chức và Admin xem báo cáo nhanh chóng mà không làm chậm các luồng mua bán vé.

* **Nhiệm vụ cụ thể:**
  1. **Dashboard cho Ban tổ chức (Organizer):**
     * Xem trực tiếp theo thời gian thực: Tổng sức chứa là bao nhiêu? Đã bán bao nhiêu vé? Còn lại bao nhiêu? Đang có bao nhiêu người giữ chỗ? Đã có bao nhiêu người đến check-in tại cổng?
     * Doanh thu thực tế theo từng loại vé (VIP, Standard, Student).
     * Vẽ biểu đồ tốc độ bán vé theo từng ngày.
  2. **Tìm kiếm người tham dự:**
     * Cho phép Ban tổ chức tìm kiếm nhanh người tham gia theo Tên, Email hoặc Mã vé để giải quyết khiếu nại.
  3. **Dashboard tổng quan cho Quản trị viên (Admin):**
     * Xem thống kê toàn sàn: Có bao nhiêu sự kiện đang diễn ra, tổng giá trị vé bán được toàn hệ thống.
  4. **Báo cáo đối soát doanh thu (Settlement Report):**
     * Khi sự kiện kết thúc, service tự động tính toán:
       $$\text{Tổng tiền thu được} - \text{Phí nền tảng (5\%)} = \text{Tiền chuyển cho Ban tổ chức}$$
     * Tạo bản kê quyết toán tài chính rõ ràng để Admin duyệt chi tiền cho Ban tổ chức.
* **Dữ liệu lưu trữ:** Bảng tổng hợp số liệu sự kiện (`event_sales_summaries`), doanh số theo ngày (`daily_sales_stats`), bảng quyết toán đối soát tài chính (`settlement_reports`).
