# Bảng Đặc Tả Chi Tiết Use Cases — Hệ Thống Quản Lý Sự Kiện & Bán Vé (Phiên Bản Tinh Gọn 16 UC)

Tài liệu đặc tả **16 Use Cases cốt lõi** (bao phủ đầy đủ 100% chức năng của cả 7 Microservices) theo chuẩn 9 thuộc tính, tên UC nêu đúng chức năng chính và luồng hoạt động trình bày ngắn gọn theo nghiệp vụ.

---

## PHÂN HỆ 1: ĐỊNH DANH & ĐỐI TÁC (IDENTITY SERVICE)

### UC-01 — Đăng ký tài khoản

| Thuộc tính | Đặc tả |
| :--- | :--- |
| Mục tiêu | Tạo tài khoản Khách hàng mới để sử dụng các chức năng tìm kiếm sự kiện, đặt vé và quản lý đơn hàng. |
| Primary actor | Customer. |
| Supporting actors | Frontend React, Identity Service (`:8001`). |
| Offstage actors | Không có. |
| Tiền điều kiện | Người dùng chưa đăng nhập và Email chưa tồn tại trong hệ thống. |
| Kích hoạt | Mở màn hình Đăng ký, nhập thông tin và nhấn xác nhận tạo tài khoản. |
| Luồng chính | 1) Người dùng nhập họ tên, email, số điện thoại và mật khẩu. 2) Hệ thống kiểm tra tính hợp lệ và trùng lặp Email. 3) Tạo tài khoản mới với vai trò Khách hàng ở trạng thái hoạt động. 4) Thông báo đăng ký thành công. |
| Ngoại lệ | Email sai định dạng, mật khẩu quá ngắn hoặc Email đã tồn tại: báo lỗi và yêu cầu nhập lại. |
| Hậu điều kiện | Tài khoản Khách hàng mới được lưu vào hệ thống. |

---

### UC-02 — Đăng nhập hệ thống

| Thuộc tính | Đặc tả |
| :--- | :--- |
| Mục tiêu | Xác thực người dùng (qua tài khoản hệ thống hoặc tài khoản liên kết ngoài) và mở phiên làm việc (tối đa 2 giờ) theo đúng vai trò. |
| Primary actor | Customer, Organizer, Event Staff, System Admin. |
| Supporting actors | Frontend React, Identity Service (`:8001`), Google OAuth 2.0 Server. |
| Offstage actors | Không có. |
| Tiền điều kiện | Tài khoản đã tồn tại (hoặc có tài khoản liên kết ngoài hợp lệ) và không bị khóa. |
| Kích hoạt | Nhấn Đăng nhập trên màn hình chính. |
| Luồng chính | 1) Người dùng nhập email/mật khẩu (hoặc chọn đăng nhập qua tài khoản liên kết ngoài). 2) Hệ thống kiểm tra thông tin xác thực; nếu dùng tài khoản liên kết lần đầu thì tự động tạo tài khoản Khách hàng mới. 3) Cấp phiên làm việc có thời hạn tối đa 2 giờ. 4) Chuyển người dùng vào giao diện tương ứng với vai trò. |
| Ngoại lệ | Sai thông tin đăng nhập hoặc xác thực ngoài thất bại: báo lỗi. Nhập sai quá nhiều lần: tạm khóa ngắn hạn. Tài khoản bị khóa hoặc phiên làm việc vượt quá 2 giờ: tự động đăng xuất và yêu cầu đăng nhập lại. |
| Hậu điều kiện | Người dùng truy cập được các chức năng thuộc vai trò của mình trong thời hạn phiên. |

---

### UC-03 — Đăng ký trở thành Ban tổ chức

| Thuộc tính | Đặc tả |
| :--- | :--- |
| Mục tiêu | Cho phép Khách hàng nộp hồ sơ doanh nghiệp để xin nâng cấp tài khoản lên Ban tổ chức sự kiện. |
| Primary actor | Customer. |
| Supporting actors | Frontend React, Identity Service (`:8001`), Notification Service (`:8006`). |
| Offstage actors | Cơ quan Thuế & Pháp lý Nhà nước. |
| Tiền điều kiện | Đã đăng nhập với vai trò Khách hàng và chưa có hồ sơ được duyệt. |
| Kích hoạt | Mở mục Đăng ký Ban tổ chức, nhập hồ sơ và nhấn Gửi xét duyệt. |
| Luồng chính | 1) Khách hàng điền tên tổ chức, mã số thuế, số điện thoại liên hệ và tài liệu giấy phép kinh doanh. 2) Hệ thống lưu hồ sơ ở trạng thái chờ duyệt. 3) Gửi thông báo xác nhận đã tiếp nhận hồ sơ. |
| Ngoại lệ | Thiếu thông tin bắt buộc hoặc đã có hồ sơ được duyệt từ trước: từ chối và báo lỗi. |
| Hậu điều kiện | Hồ sơ đối tác được lưu ở trạng thái chờ Quản trị viên thẩm định. |

---

### UC-04 — Xét duyệt và quản lý Ban tổ chức

| Thuộc tính | Đặc tả |
| :--- | :--- |
| Mục tiêu | Cho phép Quản trị viên xem, lọc danh sách tất cả Ban tổ chức, kiểm tra giấy phép và thực hiện phê duyệt, từ chối hoặc thu hồi quyền. |
| Primary actor | System Admin. |
| Supporting actors | Frontend React, Identity Service (`:8001`), Notification Service (`:8006`), SMTP Mail Server. |
| Offstage actors | Cơ quan Thuế & Pháp lý Nhà nước. |
| Tiền điều kiện | Đã đăng nhập với vai trò Quản trị viên. |
| Kích hoạt | Mở bảng điều khiển Quản trị viên, xem/lọc danh sách hoặc chọn Phê duyệt, Từ chối, Thu hồi quyền. |
| Luồng chính | 1) Quản trị viên xem danh sách hồ sơ chờ duyệt hoặc toàn bộ đối tác, tìm kiếm và lọc theo trạng thái. 2) Mở xem thông tin tài liệu giấy phép kinh doanh của đối tác. 3) Chọn Phê duyệt, Từ chối hoặc Thu hồi quyền. 4) Hệ thống cập nhật trạng thái hồ sơ, điều chỉnh vai trò tài khoản và gửi email thông báo kết quả (kèm UC-15). |
| Ngoại lệ | Không phải Quản trị viên hoặc hồ sơ không tồn tại: từ chối thao tác. |
| Hậu điều kiện | Trạng thái hoạt động và quyền Ban tổ chức của đối tác được cập nhật chính xác. |

---

## PHÂN HỆ 2: QUẢN LÝ SỰ KIỆN & NHÂN SỰ (EVENT & IDENTITY SERVICE)

### UC-05 — Xem và tìm kiếm sự kiện

| Thuộc tính | Đặc tả |
| :--- | :--- |
| Mục tiêu | Cho phép Khách hàng xem danh sách sự kiện đang mở bán, lọc theo danh mục và kiểm tra chi tiết chỗ trống. |
| Primary actor | Customer. |
| Supporting actors | Frontend React, Event Service (`:8002`), Booking Service (`:8003`). |
| Offstage actors | Không có. |
| Tiền điều kiện | Hệ thống có sự kiện đã được công bố. |
| Kích hoạt | Truy cập danh sách sự kiện, chọn bộ lọc danh mục hoặc bấm vào một sự kiện. |
| Luồng chính | 1) Hệ thống hiển thị danh sách sự kiện đã công bố và cho phép lọc theo danh mục. 2) Khách hàng chọn một sự kiện để xem thời gian, địa điểm, chính sách hoàn tiền và các hạng vé. 3) Hệ thống hiển thị sơ đồ chỗ ngồi kèm trạng thái ghế trống, đang giữ hoặc đã bán theo thời gian thực. |
| Ngoại lệ | Sự kiện bản nháp không hiển thị công khai; sự kiện không tồn tại thông báo lỗi. |
| Hậu điều kiện | Khách hàng nắm được đầy đủ thông tin, giá vé hiện hành và các vị trí còn trống. |

---

### UC-06 — Tạo và cấu hình sự kiện

| Thuộc tính | Đặc tả |
| :--- | :--- |
| Mục tiêu | Cho phép Ban tổ chức tạo sự kiện mới, thiết kế sơ đồ khu vực/ghế ngồi, cấu hình hạng vé, khung giờ bán, bảng giá và công bố mở bán. |
| Primary actor | Organizer. |
| Supporting actors | Frontend React, Event Service (`:8002`). |
| Offstage actors | Trường Đại học (TDTU). |
| Tiền điều kiện | Đã đăng nhập với vai trò Ban tổ chức. |
| Kích hoạt | Nhấn tạo sự kiện mới, chỉnh sửa sơ đồ/hạng vé trên bản nháp hoặc nhấn nút Công bố. |
| Luồng chính | 1) Ban tổ chức tạo sự kiện ở trạng thái Bản nháp (cấp mã thứ tự riêng theo từng tổ chức). 2) Tạo khu vực đứng (nhập sức chứa) hoặc khu vực ngồi (lưới hàng $\times$ cột), đánh dấu lối đi/ghế khóa và phân hạng ghế. 3) Thiết lập các hạng vé, số lượng, giới hạn vé mỗi đơn, điều kiện email sinh viên (nếu có), thời gian mở/đóng bán vé và giá ưu đãi theo giai đoạn. 4) Nhấn Công bố; hệ thống kiểm tra đủ khu vực/loại vé và chuyển sang Công bố (tự động cập nhật Đang diễn ra / Đã kết thúc theo thời gian). |
| Ngoại lệ | Thời gian không hợp lệ, tổng vé vượt sức chứa khu vực, chưa cấu hình đủ vé khi công bố hoặc cố sửa sự kiện đã công bố: từ chối và báo lỗi. |
| Hậu điều kiện | Sự kiện, sơ đồ chỗ ngồi và bảng giá được lưu hoàn chỉnh và sẵn sàng bán vé khi công bố. |

---

### UC-07 — Hủy sự kiện

| Thuộc tính | Đặc tả |
| :--- | :--- |
| Mục tiêu | Cho phép Ban tổ chức hủy bỏ sự kiện đã công bố một cách an toàn, tự động hoàn tiền cho khách đã mua và gửi thông báo. |
| Primary actor | Organizer. |
| Supporting actors | Frontend React, Event Service (`:8002`), Identity Service (`:8001`), Payment Service (`:8004`), Booking Service (`:8003`), Ticket Service (`:8005`), Notification Service (`:8006`), SMTP Mail Server. |
| Offstage actors | Ngân hàng phát hành thẻ, Bộ phận Kế toán Sàn. |
| Tiền điều kiện | Sự kiện đã công bố và chưa kết thúc hoặc chưa bị hủy. |
| Kích hoạt | Nhấn nút Hủy sự kiện và thực hiện xác nhận hủy. |
| Luồng chính | 1) Ban tổ chức yêu cầu mã xác nhận và nhập lý do hủy, tên sự kiện, mật khẩu tài khoản cùng mã xác nhận. 2) Hệ thống xác thực các thông tin bảo mật. 3) Chuyển trạng thái sự kiện sang Đang hủy. 4) Tự động kích hoạt hoàn tiền toàn bộ vé đã bán (gọi kèm UC-12) và gửi thông báo hủy sự kiện tới khách hàng (gọi kèm UC-15). |
| Ngoại lệ | Sai mật khẩu, sai tên sự kiện hoặc mã xác nhận không hợp lệ/hết hạn: từ chối hủy sự kiện. |
| Hậu điều kiện | Sự kiện chuyển sang trạng thái hủy; khách hàng được hoàn tiền và các vé đã phát hành bị vô hiệu hóa. |

---

### UC-08 — Quản lý và phân công nhân viên

| Thuộc tính | Đặc tả |
| :--- | :--- |
| Mục tiêu | Cho phép mỗi Ban tổ chức quản lý danh sách nhân viên độc lập của riêng mình và phân công nhân viên vào trực từng sự kiện kèm quyền hạn cụ thể. |
| Primary actor | Organizer. |
| Supporting actors | Frontend React, Identity Service (`:8001`). |
| Offstage actors | Không có. |
| Tiền điều kiện | Đã đăng nhập với vai trò Ban tổ chức. |
| Kích hoạt | Mở mục Nhân sự để thêm/xóa nhân viên hoặc chọn phân công/gỡ phân công khỏi sự kiện. |
| Luồng chính | 1) Hệ thống hiển thị danh sách nhân viên riêng của Ban tổ chức theo thứ tự `#1, #2, #3...`. 2) Ban tổ chức thêm nhân viên mới hoặc xóa nhân viên thuộc quyền quản lý của mình. 3) Tại mục Phân công, chọn sự kiện, nhân viên, nhập vị trí trực và cấp quyền (soát vé, tra cứu khách). 4) Cho phép gỡ phân công khỏi sự kiện mà vẫn giữ tài khoản nhân viên. |
| Ngoại lệ | Email nhân viên đã tồn tại hoặc cố thao tác trên nhân viên thuộc tổ chức khác: báo lỗi và từ chối. |
| Hậu điều kiện | Danh sách nhân sự độc lập và bảng phân công theo sự kiện được cập nhật chính xác. |

---

## PHÂN HỆ 3: ĐẶT GIỮ CHỖ & THANH TOÁN (BOOKING & PAYMENT SERVICE)

### UC-09 — Đặt vé và giữ chỗ

| Thuộc tính | Đặc tả |
| :--- | :--- |
| Mục tiêu | Cho phép Khách hàng chọn ghế hoặc số lượng vé đứng, kiểm tra đủ điều kiện mua và tạm khóa chỗ trong 10 phút để chờ thanh toán mà không bị trùng hoặc bán lố. |
| Primary actor | Customer. |
| Supporting actors | Frontend React, Booking Service (`:8003`), Event Service (`:8002`), Notification Service (`:8006`). |
| Offstage actors | Trường Đại học (TDTU). |
| Tiền điều kiện | Đã đăng nhập và sự kiện đang trong trạng thái/khung giờ mở bán. |
| Kích hoạt | Chọn ghế hoặc số lượng vé đứng và nhấn Tiến hành đặt vé. |
| Luồng chính | 1) Hệ thống kiểm tra điều kiện mua vé (khung giờ mở bán, giới hạn vé mỗi đơn, điều kiện email sinh viên nếu có) và xác định đơn giá áp dụng. 2) Thực hiện khóa các ghế đã chọn hoặc trừ tạm tồn kho vé đứng trong thời hạn 10 phút. 3) Tạo đơn giữ chỗ ở trạng thái chờ thanh toán. 4) Gửi thông báo nhắc hạn thanh toán (gọi kèm UC-15) và mở cửa sổ thanh toán. |
| Ngoại lệ | Chưa chọn ghế, ngoài giờ bán, vượt giới hạn vé, sai email sinh viên, hết vé đứng hoặc ghế vừa bị người khác chọn trước: hủy giao dịch giữ chỗ và thông báo chọn lại. |
| Hậu điều kiện | Chỗ ngồi được tạm khóa trong 10 phút cho Khách hàng hiện tại. |

---

### UC-10 — Thanh toán đơn hàng

| Thuộc tính | Đặc tả |
| :--- | :--- |
| Mục tiêu | Thu tiền đơn giữ chỗ trực tuyến, xác nhận đơn đã thanh toán, chuyển ghế sang đã bán, tự động phát hành vé điện tử và quay thẳng về trang web. |
| Primary actor | Customer. |
| Supporting actors | Frontend React, Payment Service (`:8004`), VNPay Gateway, Booking Service (`:8003`), Ticket Service (`:8005`), Reporting Service (`:8007`), Notification Service (`:8006`). |
| Offstage actors | Ngân hàng phát hành thẻ, Bộ phận Kế toán Sàn. |
| Tiền điều kiện | Đơn giữ chỗ đang ở trạng thái chờ thanh toán và còn trong thời hạn 10 phút. |
| Kích hoạt | Nhấn nút Thanh toán trên cửa sổ thanh toán hoặc trong danh sách đơn giữ chỗ. |
| Luồng chính | 1) Hệ thống tạo giao dịch thanh toán và chuyển khách hàng sang cổng thanh toán trực tuyến. 2) Khách hàng hoàn tất thanh toán trên cổng thanh toán. 3) Hệ thống xác thực kết quả thành công, cập nhật đơn hàng thành Đã thanh toán và khóa ghế thành Đã bán. 4) Tự động phát hành vé điện tử kèm mã QR cho từng ghế/suất vé, ghi nhận doanh thu và gửi email biên lai (gọi kèm UC-15). 5) Chuyển hướng trực tiếp khách hàng về trang web. |
| Ngoại lệ | Giao dịch thất bại, bị hủy hoặc thanh toán trễ khi đơn đã quá hạn 10 phút: đánh dấu giao dịch không thành công, trả ghế về kho (hoặc kích hoạt hoàn tiền) và quay về trang đơn hàng. |
| Hậu điều kiện | Đơn hàng hoàn tất thanh toán, vé điện tử được phát hành và doanh thu được ghi nhận. |

---

### UC-11 — Hủy giữ chỗ hoặc thu hồi chỗ hết hạn

| Thuộc tính | Đặc tả |
| :--- | :--- |
| Mục tiêu | Giải phóng kịp thời ghế ngồi và vé đứng nếu Khách hàng chủ động hủy đơn chưa thanh toán hoặc đơn đã quá thời hạn giữ 10 phút. |
| Primary actor | Customer. |
| Supporting actors | Frontend React, Booking Service (`:8003`). |
| Offstage actors | Các khách hàng khác đang chờ mua vé. |
| Tiền điều kiện | Đơn hàng đang ở trạng thái chờ thanh toán. |
| Kích hoạt | Khách hàng nhấn Hủy giữ chỗ, hoặc Bộ định thời phát hiện đơn đã quá hạn 10 phút. |
| Luồng chính | 1) Hệ thống kiểm tra quyền hủy của người dùng hoặc mốc hết hạn của đơn. 2) Cập nhật trạng thái đơn sang Đã hủy hoặc Hết hạn. 3) Mở khóa toàn bộ ghế đang giữ và trả lại số lượng vé đứng về kho. 4) Ẩn thao tác thanh toán đối với đơn đã hết hạn/hủy. |
| Ngoại lệ | Đơn đã thanh toán thành công trước đó hoặc người hủy không phải chủ đơn: từ chối thao tác. |
| Hậu điều kiện | Chỗ ngồi và số lượng vé được trả lại trạng thái còn trống cho người khác đặt. |

---

### UC-12 — Hoàn tiền giao dịch

| Thuộc tính | Đặc tả |
| :--- | :--- |
| Mục tiêu | Hoàn trả tiền cho giao dịch đã thanh toán hợp lệ, đồng thời thu hồi ghế về kho và vô hiệu hóa các vé điện tử liên quan. |
| Primary actor | Customer (hoặc kích hoạt tự động từ UC-07). |
| Supporting actors | Frontend React, Payment Service (`:8004`), Booking Service (`:8003`), Ticket Service (`:8005`), Reporting Service (`:8007`), Notification Service (`:8006`), SMTP Mail Server. |
| Offstage actors | Ngân hàng phát hành thẻ, Bộ phận Kế toán Sàn. |
| Tiền điều kiện | Giao dịch đã thanh toán thành công và còn số dư chưa hoàn. |
| Kích hoạt | Khách hàng yêu cầu hoàn tiền ở lịch sử giao dịch hoặc hệ thống tự động gọi khi hủy sự kiện. |
| Luồng chính | 1) Kiểm tra quyền yêu cầu hoàn tiền và số tiền hoàn hợp lệ. 2) Ghi nhận giao dịch hoàn tiền thành công. 3) Hủy đơn hàng tương ứng, trả ghế/vé đứng về kho và hủy hiệu lực toàn bộ vé điện tử thuộc đơn. 4) Cập nhật trừ doanh thu ròng ở báo cáo và gửi email thông báo hoàn tiền (gọi kèm UC-15). |
| Ngoại lệ | Số tiền yêu cầu vượt quá số đã thanh toán hoặc giao dịch chưa thành công: từ chối yêu cầu. |
| Hậu điều kiện | Khoản hoàn tiền được ghi nhận; ghế trống trở lại và vé cũ hết hiệu lực sử dụng. |

---

## PHÂN HỆ 4: VÉ ĐIỆN TỬ & CHECK-IN (TICKET SERVICE)

### UC-13 — Quản lý vé điện tử (Xem vé & Sang nhượng)

| Thuộc tính | Đặc tả |
| :--- | :--- |
| Mục tiêu | Cho phép Khách hàng xem thông tin, mã QR của các vé mình sở hữu và chuyển nhượng vé hợp lệ sang người khác. |
| Primary actor | Customer. |
| Supporting actors | Frontend React, Ticket Service (`:8005`), Booking Service (`:8003`), Notification Service (`:8006`). |
| Offstage actors | Ban tổ chức sự kiện. |
| Tiền điều kiện | Đã đăng nhập; có vé đã phát hành thuộc sở hữu của Khách hàng. |
| Kích hoạt | Mở tab Vé QR của tôi để xem vé, hoặc chọn Sang nhượng vé trên thẻ vé chưa sử dụng. |
| Luồng chính | 1) Hệ thống đồng bộ và hiển thị danh sách vé kèm mã QR, vị trí chỗ ngồi và trạng thái vé. 2) Nếu khách chọn Sang nhượng vé: nhập thông tin người nhận và xác nhận. 3) Hệ thống kiểm tra vé hợp lệ, chuyển chủ sở hữu sang người nhận, vô hiệu hóa mã QR cũ và cấp mã QR mới. 4) Ghi nhận lịch sử chuyển nhượng và gửi thông báo cho người nhận (gọi kèm UC-15). |
| Ngoại lệ | Chuyển vé cho chính mình, không phải chủ vé hoặc vé đã check-in/đã hủy: từ chối chuyển nhượng. |
| Hậu điều kiện | Khách hàng xem được vé để vào cổng; nếu sang nhượng thì vé thuộc về người nhận với mã QR mới. |

---

### UC-14 — Kiểm tra vé vào cổng và tra cứu khách

| Thuộc tính | Đặc tả |
| :--- | :--- |
| Mục tiêu | Cho phép nhân viên sự kiện quét mã QR xác thực vé vào cổng (chống vé giả, vé trùng) và tra cứu danh sách khách tham dự theo quyền được cấp. |
| Primary actor | Event Staff. |
| Supporting actors | Frontend React, Ticket Service (`:8005`), Identity Service (`:8001`), Reporting Service (`:8007`). |
| Offstage actors | Ban tổ chức sự kiện, Bộ phận Kế toán Sàn. |
| Tiền điều kiện | Đã đăng nhập với vai trò Nhân viên và được phân công quyền tương ứng tại sự kiện. |
| Kích hoạt | Mở màn hình Soát vé, tìm kiếm khách trong danh sách hoặc quét mã vé và nhấn Xác thực vé. |
| Luồng chính | 1) Hệ thống tải danh sách khách tham dự và trạng thái vào cổng của sự kiện nhân viên đang trực. 2) Nhân viên nhập hoặc quét mã vé của khách. 3) Hệ thống kiểm tra chữ ký vé, đúng sự kiện và vé chưa từng qua cổng. 4) Đánh dấu vé đã vào cổng, ghi nhật ký soát vé và cộng lượt tham dự sang hệ thống báo cáo. |
| Ngoại lệ | Vé giả, sai sự kiện, vé đã hủy, mã QR cũ sau chuyển nhượng hoặc vé đã check-in trước đó: từ chối cho vào cổng, cảnh báo lỗi và lưu nhật ký quét lỗi. Không có quyền tương ứng: khóa chức năng. |
| Hậu điều kiện | Vé hợp lệ được ghi nhận đã check-in một lần duy nhất; danh sách khách cập nhật trạng thái tức thời. |

---

## PHÂN HỆ 5: THÔNG BÁO & BÁO CÁO ĐỐI SOÁT (NOTIFICATION & REPORTING SERVICE)

### UC-15 — Gửi thông báo và nhắc lịch tự động

| Thuộc tính | Đặc tả |
| :--- | :--- |
| Mục tiêu | Tự động gửi email thông báo theo các sự kiện nghiệp vụ, thử lại khi gặp lỗi đường truyền và nhắc lịch tham dự trước giờ khai mạc 24 giờ. |
| Primary actor | Không có (tự động kích hoạt ngầm từ UC-04, UC-07, UC-09, UC-10, UC-12, UC-13). |
| Supporting actors | Notification Service (`:8006`), Event Service (`:8002`), Ticket Service (`:8005`), SMTP Mail Server. |
| Offstage actors | Khách hàng tham dự sự kiện. |
| Tiền điều kiện | Có mẫu thông báo phù hợp và địa chỉ nhận hợp lệ. |
| Kích hoạt | Nhận thông báo sự kiện từ các dịch vụ khác hoặc chu kỳ quét định kỳ của Bộ định thời. |
| Luồng chính | 1) Lấy mẫu thông báo và ghép nội dung chi tiết tương ứng. 2) Với nhắc lịch 24h: tìm các sự kiện sắp diễn ra và danh sách người giữ vé hợp lệ. 3) Gửi email tới người nhận và lưu nhật ký kết quả. 4) Nếu gửi lỗi tạm thời, tự động xếp hàng thử lại ở lần quét kế tiếp. |
| Ngoại lệ | Sự kiện đã hủy, vé đã hoàn tiền hoặc lỗi gửi vượt số lần thử lại: bỏ qua gửi nhắc hoặc đánh dấu thất bại. |
| Hậu điều kiện | Người dùng nhận được đầy đủ thông báo kịp thời và lịch sử gửi được lưu vết. |

---

### UC-16 — Xem thống kê doanh thu và quyết toán

| Thuộc tính | Đặc tả |
| :--- | :--- |
| Mục tiêu | Giúp Ban tổ chức theo dõi doanh thu và lượng khách check-in của riêng mình; đồng thời giúp Quản trị viên xem thống kê toàn sàn và duyệt quyết toán chi trả cho Ban tổ chức. |
| Primary actor | Organizer, System Admin. |
| Supporting actors | Frontend React, Reporting Service (`:8007`). |
| Offstage actors | Cơ quan Thuế & Pháp lý Nhà nước, Bộ phận Kế toán Sàn. |
| Tiền điều kiện | Đã đăng nhập đúng vai trò (Ban tổ chức hoặc Quản trị viên); sự kiện đã kết thúc đối với bước quyết toán. |
| Kích hoạt | Mở màn hình Dashboard thống kê/báo cáo hoặc Bộ định thời phát hiện sự kiện vừa kết thúc. |
| Luồng chính | 1) Với Ban tổ chức: xem doanh thu gộp/ròng, tiền hoàn, tốc độ bán theo ngày, số vé bán/còn lại và tỷ lệ check-in cho các sự kiện của chính mình. 2) Khi sự kiện kết thúc: hệ thống tự động lập bản kê quyết toán (tổng thu trừ phí nền tảng để tính tiền chuyển cho Ban tổ chức). 3) Với Quản trị viên: xem thống kê tổng quan toàn sàn và kiểm tra, duyệt chi trả các bản kê quyết toán. |
| Ngoại lệ | Truy cập báo cáo không thuộc quyền hạn: từ chối. Sự kiện chưa có giao dịch: hiển thị giá trị bằng 0. |
| Hậu điều kiện | Ban tổ chức nắm bắt được hiệu quả sự kiện; Quản trị viên kiểm soát và phê duyệt quyết toán tài chính minh bạch. |
