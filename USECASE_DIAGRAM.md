# Thiết Kế Use Case Diagram — Nền Tảng Quản Lý Sự Kiện & Bán Vé (16 Use Cases Cốt Lõi — 7 Microservices SOA)

Tài liệu thiết kế Use Case dưới đây đồng bộ hoàn toàn với **Bảng Đặc Tả 16 Use Cases ([USECASE_SPECIFICATIONS.md](file:///c:/Code/Python-Files/Microservices/soa-event-platform/USECASE_SPECIFICATIONS.md))**, bao phủ trọn vẹn **7 Microservices** và phân loại tác nhân theo chuẩn **Craig Larman (*Applying UML and Patterns*)**: **4 Primary Actors**, **10 Supporting Actors** (3 Hệ thống ngoài + 7 Microservices nội bộ) và **4 Offstage Actors**.

---

## 1. Phân Loại Đầy Đủ Các Tác Nhân (Actors Classification)

### A. Primary Actors (4 Tác nhân chính — Con người chủ động kích hoạt Use Case)
| Ký hiệu | Tác nhân (Actor) | Vai trò & Mục tiêu chính | Các Use Case thực hiện |
| :--- | :--- | :--- | :--- |
| **PA1** | **Khách hàng (Customer)** | Đăng ký tài khoản, đăng nhập (JWT 2h / Google), xem & lọc sự kiện công khai, chọn ghế/vé đứng & giữ chỗ 10 phút, thanh toán VNPay, hủy giữ chỗ, yêu cầu hoàn tiền, mở tab **"Vé của tôi"** để xem/phóng to (**Zoom**) vé điện tử QR hoặc sang nhượng vé, nộp hồ sơ nâng cấp lên Ban tổ chức. | `UC-01`, `UC-02`, `UC-03`, `UC-05`, `UC-09`, `UC-10`, `UC-11`, `UC-12`, `UC-13` |
| **PA2** | **Ban tổ chức (Organizer)** | Tạo & cấu hình sự kiện (sơ đồ ghế `Grid Map`, loại vé, giờ bán, giá Early Bird, công bố), hủy sự kiện xác thực 3 lớp, quản lý danh sách nhân viên độc lập (`#1, #2...`, tách biệt tuyệt đối email giữa các tổ chức) & phân công sự kiện, xem thống kê doanh thu/check-in và quyết toán. | `UC-02`, `UC-06`, `UC-07`, `UC-08`, `UC-16` |
| **PA3** | **Nhân viên sự kiện (Event Staff)** | Mở cửa sổ **Camera quét mã QR trực tiếp** (hoặc chọn ảnh QR / dán mã) để **tự động xác thực & check-in tức thời** mà không cần bấm nút xác thực thủ công, tra cứu danh sách khách tham dự theo quyền (`CHECKIN`, `VIEW_ATTENDEES`). | `UC-02`, `UC-14` |
| **PA4** | **Quản trị viên (System Admin)** | Xem & lọc danh sách tất cả Ban tổ chức, kiểm tra giấy phép pháp lý, thực hiện `Phê duyệt` / `Từ chối` / `Thu hồi quyền`, xem thống kê toàn sàn và phê duyệt chi trả quyết toán (`Settlement Report`). | `UC-02`, `UC-04`, `UC-16` |

*(Lưu ý: Bộ định thời `Task Scheduler` đã được chuyển xuống tầng hạ tầng `Cross-Cutting Services`, tự động kích hoạt ngầm cho `UC-11` và `UC-15` thay vì đóng vai trò Primary Actor).*

---

### B. Supporting Actors (Tác nhân phụ trợ — Cung cấp dịch vụ phía sau cho Use Case)

#### Nhóm B1 — Hệ thống tích hợp bên ngoài (External Supporting Actors)
1. **VNPay Payment Gateway**: Cổng thanh toán xử lý giao dịch ngân hàng, trả kết quả và tự động chuyển hướng (`302 Redirect`) khách hàng về trang web.
2. **Google OAuth 2.0 Server**: Xác thực danh tính người dùng khi đăng nhập một chạm bằng Google (`id_token`).
3. **SMTP / Email Server**: Hạ tầng máy chủ chuyển phát email tự động tới hộp thư người dùng.

#### Nhóm B2 — 7 Microservices nội bộ của Nền tảng (Internal Service Supporting Actors)
4. **1. Identity Service (`:8001`)**: Quản lý tài khoản, cấp & làm mới JWT Token (giới hạn phiên tối đa 2 tiếng), kiểm soát phân quyền RBAC, duyệt hồ sơ Ban tổ chức, quản lý danh sách nhân sự riêng từng tổ chức.
5. **2. Event Service (`:8002`)**: Quản lý vòng đời sự kiện, sơ đồ ghế (`Grid Map`), kiểm tra điều kiện mua vé (khung giờ mở bán, email sinh viên `@tdtu.edu.vn`, giới hạn vé/đơn, giá động Early Bird).
6. **3. Booking Service (`:8003`)**: Khóa ghế nguyên tử chống bán lố, quản lý giữ chỗ 10 phút (`TTL`) và tồn kho vé đứng, tự động thu hồi chỗ quá hạn.
7. **4. Payment Service (`:8004`)**: Tạo phiên thanh toán VNPay, chống trừ tiền 2 lần (`Idempotency Key`) và xử lý hoàn tiền (`Refund`).
8. **5. Ticket Service (`:8005`)**: Phát hành vé điện tử (`x-internal-key`), sinh ảnh mã QR chuẩn `ISO/IEC 18004` ký số `HMAC-SHA256`, đổi mã QR mới khi sang nhượng (`qr_version + 1`), tự động xác thực check-in qua camera chống quay vòng vé.
9. **6. Notification Service (`:8006`)**: Quản lý mẫu thông báo HTML, tự động gửi email khi đặt vé, thanh toán, gửi vé QR, báo hủy sự kiện và nhắc lịch trước 24h kèm cơ chế tự thử lại (`Retry`).
10. **7. Reporting Service (`:8007`)**: Tổng hợp thống kê doanh thu, tốc độ bán theo ngày, số lượng check-in theo thời gian thực và lập báo cáo đối soát quyết toán sau sự kiện (`Tổng thu - 5% phí sàn`).

---

### C. Offstage Actors (Tác nhân hậu trường — Có quyền lợi/ràng buộc được hệ thống bảo vệ)
| Ký hiệu | Tác nhân hậu trường | Mối quan tâm / Quyền lợi cần hệ thống bảo vệ (Interests) |
| :--- | :--- | :--- |
| **OA1** | **Cơ quan Thuế & Pháp lý Nhà nước** | Đảm bảo Ban tổ chức hoạt động có Mã số thuế (`tax_code`) và Giấy phép kinh doanh hợp lệ; số liệu doanh thu & hoàn tiền minh bạch. |
| **OA2** | **Trường Đại học (TDTU)** | Đảm bảo ưu đãi giá **Vé Sinh Viên** chỉ áp dụng đúng cho sinh viên có email học vụ hợp lệ (`@tdtu.edu.vn`) và đúng hạn mức. |
| **OA3** | **Ngân hàng phát hành thẻ** | Đảm bảo giao dịch thanh toán và hoàn tiền chính xác, không bị trừ tiền trùng lặp. |
| **OA4** | **Bộ phận Kế toán / Tài chính Sàn** | Kiểm soát chính xác bảng quyết toán (`settlement_reports`), khoản khấu trừ **phí nền tảng 5%**, nhật ký hoàn tiền và nhật ký check-in. |

---

## 2. Sơ Đồ Use Case Tổng Quan 16 Use Cases & 7 Microservices (Mermaid Diagram)

```mermaid
flowchart LR
    %% ==================== PRIMARY ACTORS (LEFT - 4 CON NGƯỜI) ====================
    subgraph PRIMARY["👤 PRIMARY ACTORS (4 Tác nhân chính)"]
        direction TB
        Customer["🛒 Customer\n(Khách hàng)"]
        Organizer["🏢 Organizer\n(Ban tổ chức)"]
        Staff["🎫 Event Staff\n(Nhân viên sự kiện)"]
        Admin["🛡️ System Admin\n(Quản trị viên)"]
    end

    %% ==================== SYSTEM BOUNDARY (CENTER - 16 USE CASES) ====================
    subgraph SYSTEM["🏛️ HỆ THỐNG QUẢN LÝ SỰ KIỆN & BÁN VÉ SOA (16 USE CASES)"]
        direction TB

        subgraph MOD1["1. Định danh & Đối tác (Identity)"]
            UC01(["UC-01: Đăng ký tài khoản"])
            UC02(["UC-02: Đăng nhập hệ thống (JWT 2h / Google)"])
            UC03(["UC-03: Đăng ký trở thành Ban tổ chức"])
            UC04(["UC-04: Xét duyệt và quản lý Ban tổ chức"])
        end

        subgraph MOD2["2. Sự kiện & Nhân sự (Event & Identity)"]
            UC05(["UC-05: Xem và tìm kiếm sự kiện"])
            UC06(["UC-06: Tạo và cấu hình sự kiện"])
            UC07(["UC-07: Hủy sự kiện"])
            UC08(["UC-08: Quản lý và phân công nhân viên"])
        end

        subgraph MOD3["3. Đặt giữ chỗ & Thanh toán (Booking & Payment)"]
            UC09(["UC-09: Đặt vé và giữ chỗ (10 phút)"])
            UC10(["UC-10: Thanh toán đơn hàng"])
            UC11(["UC-11: Hủy giữ chỗ hoặc thu hồi chỗ hết hạn"])
            UC12(["UC-12: Hoàn tiền giao dịch"])
        end

        subgraph MOD4["4. Vé điện tử & Check-in (Ticket)"]
            UC13(["UC-13: Quản lý vé điện tử (Xem, Zoom QR & Sang nhượng)"])
            UC14(["UC-14: Kiểm tra vé vào cổng (Camera Auto-Verify) & Tra cứu khách"])
        end

        subgraph MOD5["5. Thông báo & Báo cáo Đối soát (Notification & Reporting)"]
            UC15(["UC-15: Gửi thông báo và nhắc lịch tự động"])
            UC16(["UC-16: Xem thống kê doanh thu và quyết toán"])
        end
    end

    %% ==================== SUPPORTING ACTORS (RIGHT) ====================
    subgraph SUPPORTING["⚙️ SUPPORTING ACTORS (External & 7 Microservices)"]
        direction TB
        GoogleSvc["🌐 Google OAuth 2.0"]
        VNPaySvc["💳 VNPay Gateway"]
        MailSvc["📧 SMTP Mail Server"]
        S1["1️⃣ Identity Service :8001"]
        S2["2️⃣ Event Service :8002"]
        S3["3️⃣ Booking Service :8003"]
        S4["4️⃣ Payment Service :8004"]
        S5["5️⃣ Ticket Service :8005"]
        S6["6️⃣ Notification Service :8006"]
        S7["7️⃣ Reporting Service :8007"]
    end

    %% Primary Actor -> Use Cases
    Customer --> UC01
    Customer --> UC02
    Customer --> UC03
    Customer --> UC05
    Customer --> UC09
    Customer --> UC10
    Customer --> UC11
    Customer --> UC12
    Customer --> UC13

    Organizer --> UC02
    Organizer --> UC06
    Organizer --> UC07
    Organizer --> UC08
    Organizer --> UC16

    Staff --> UC02
    Staff --> UC14

    Admin --> UC02
    Admin --> UC04
    Admin --> UC16

    %% Include Relationships
    UC04 -. "<<include>>" .-> UC15
    UC07 -. "<<include>>" .-> UC12
    UC07 -. "<<include>>" .-> UC15
    UC09 -. "<<include>>" .-> UC15
    UC10 -. "<<include>>" .-> UC15
    UC12 -. "<<include>>" .-> UC15
    UC13 -. "<<include>>" .-> UC15

    %% Use Cases -> Supporting Actors
    UC01 --> S1
    UC02 --> S1
    UC02 --> GoogleSvc
    UC03 --> S1
    UC04 --> S1
    UC08 --> S1

    UC05 --> S2
    UC05 --> S3
    UC06 --> S2
    UC07 --> S2
    UC07 --> S1

    UC09 --> S3
    UC09 --> S2
    UC11 --> S3

    UC10 --> S4
    UC10 --> VNPaySvc
    UC10 --> S3
    UC10 --> S5
    UC10 --> S7

    UC12 --> S4
    UC12 --> S3
    UC12 --> S5
    UC12 --> S7

    UC13 --> S5
    UC14 --> S5
    UC14 --> S1
    UC14 --> S7

    UC15 --> S6
    UC15 --> MailSvc

    UC16 --> S7
```

---

## 3. Mã PlantUML Chuẩn UML (16 Use Cases & 4 Primary Actors)

```plantuml
@startuml SOA_Event_Platform_16_UseCases
left to right direction
skinparam packageStyle rectangle
skinparam shadowing false
skinparam actorStyle awesome

' ==================== 4 PRIMARY ACTORS (BÊN TRÁI) ====================
actor "Customer\n(Khách hàng)" as Customer <<Primary>>
actor "Organizer\n(Ban tổ chức)" as Organizer <<Primary>>
actor "Event Staff\n(Nhân viên sự kiện)" as Staff <<Primary>>
actor "System Admin\n(Quản trị viên)" as Admin <<Primary>>

' ==================== SYSTEM BOUNDARY (16 USE CASES) ====================
rectangle "Hệ Thống Quản Lý Sự Kiện & Bán Vé Trực Tuyến (SOA 7 Microservices)" {

  package "1. Định danh & Đối tác" {
    usecase "UC-01: Đăng ký tài khoản" as UC01
    usecase "UC-02: Đăng nhập hệ thống" as UC02
    usecase "UC-03: Đăng ký trở thành Ban tổ chức" as UC03
    usecase "UC-04: Xét duyệt và quản lý Ban tổ chức" as UC04
  }

  package "2. Quản lý Sự kiện & Nhân sự" {
    usecase "UC-05: Xem và tìm kiếm sự kiện" as UC05
    usecase "UC-06: Tạo và cấu hình sự kiện" as UC06
    usecase "UC-07: Hủy sự kiện" as UC07
    usecase "UC-08: Quản lý và phân công nhân viên" as UC08
  }

  package "3. Đặt giữ chỗ & Thanh toán" {
    usecase "UC-09: Đặt vé và giữ chỗ" as UC09
    usecase "UC-10: Thanh toán đơn hàng" as UC10
    usecase "UC-11: Hủy giữ chỗ hoặc thu hồi chỗ hết hạn" as UC11
    usecase "UC-12: Hoàn tiền giao dịch" as UC12
  }

  package "4. Vé điện tử & Check-in" {
    usecase "UC-13: Quản lý vé điện tử\n(Xem vé, Zoom vé QR & Sang nhượng)" as UC13
    usecase "UC-14: Kiểm tra vé vào cổng\n(Camera Auto-Verify) & Tra cứu khách" as UC14
  }

  package "5. Thông báo & Báo cáo Đối soát" {
    usecase "UC-15: Gửi thông báo và nhắc lịch tự động" as UC15
    usecase "UC-16: Xem thống kê doanh thu và quyết toán" as UC16
  }
}

' ==================== SUPPORTING ACTORS (BÊN PHẢI) ====================
actor "Google OAuth 2.0" as Google <<Supporting External>>
actor "VNPay Gateway" as VNPay <<Supporting External>>
actor "SMTP Mail Server" as Mail <<Supporting External>>

actor "1. Identity Service (:8001)" as S1 <<Supporting Service>>
actor "2. Event Service (:8002)" as S2 <<Supporting Service>>
actor "3. Booking Service (:8003)" as S3 <<Supporting Service>>
actor "4. Payment Service (:8004)" as S4 <<Supporting Service>>
actor "5. Ticket Service (:8005)" as S5 <<Supporting Service>>
actor "6. Notification Service (:8006)" as S6 <<Supporting Service>>
actor "7. Reporting Service (:8007)" as S7 <<Supporting Service>>

' --- Liên kết Primary Actors ---
Customer --> UC01
Customer --> UC02
Customer --> UC03
Customer --> UC05
Customer --> UC09
Customer --> UC10
Customer --> UC11
Customer --> UC12
Customer --> UC13

Organizer --> UC02
Organizer --> UC06
Organizer --> UC07
Organizer --> UC08
Organizer --> UC16

Staff --> UC02
Staff --> UC14

Admin --> UC02
Admin --> UC04
Admin --> UC16

' --- Quan hệ Include ---
UC04 ..> UC15 : <<include>>
UC07 ..> UC12 : <<include>>
UC07 ..> UC15 : <<include>>
UC09 ..> UC15 : <<include>>
UC10 ..> UC15 : <<include>>
UC12 ..> UC15 : <<include>>
UC13 ..> UC15 : <<include>>

' --- Liên kết Supporting Actors ---
UC01 --> S1
UC02 --> S1
UC02 --> Google
UC03 --> S1
UC04 --> S1
UC08 --> S1

UC05 --> S2
UC05 --> S3
UC06 --> S2
UC07 --> S2
UC07 --> S1

UC09 --> S3
UC09 --> S2
UC11 --> S3

UC10 --> S4
UC10 --> VNPay
UC10 --> S3
UC10 --> S5
UC10 --> S7

UC12 --> S4
UC12 --> S3
UC12 --> S5
UC12 --> S7

UC13 --> S5
UC14 --> S5
UC14 --> S1
UC14 --> S7

UC15 --> S6
UC15 --> Mail
UC16 --> S7
@enduml
```
