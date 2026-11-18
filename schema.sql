-- ==============================================================================
-- ĐỒ ÁN CUỐI KỲ: MÔN KIẾN TRÚC HƯỚNG DỊCH VỤ (SOA)
-- HỆ THỐNG: NỀN TẢNG QUẢN LÝ SỰ KIỆN VÀ BÁN VÉ (EVENT MANAGEMENT PLATFORM)
-- KIẾN TRÚC: Database-per-Service (MySQL 8.0+)
-- ==============================================================================

-- ==============================================================================
-- 1. IDENTITY SERVICE DATABASE
-- Quản lý: Tài khoản, xác thực, phân quyền (RBAC), duyệt Organizer, gán quyền Staff
-- ==============================================================================
CREATE DATABASE IF NOT EXISTS `identity_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `identity_db`;

DROP TABLE IF EXISTS `event_staff_assignments`;
DROP TABLE IF EXISTS `organizer_profiles`;
DROP TABLE IF EXISTS `users`;

-- Bảng tài khoản người dùng
CREATE TABLE `users` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(255) DEFAULT NULL COMMENT 'NULL nếu đăng nhập bằng Google OAuth',
    `full_name` VARCHAR(100) NOT NULL,
    `phone` VARCHAR(20) DEFAULT NULL,
    `role` ENUM('CUSTOMER', 'ORGANIZER', 'STAFF', 'ADMIN') NOT NULL DEFAULT 'CUSTOMER',
    `status` ENUM('ACTIVE', 'INACTIVE', 'PENDING_APPROVAL') NOT NULL DEFAULT 'ACTIVE',
    `google_id` VARCHAR(100) DEFAULT NULL,
    `auth_provider` VARCHAR(20) NOT NULL DEFAULT 'LOCAL',
    `avatar_url` VARCHAR(255) DEFAULT NULL,
    `created_by_organizer_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Organizer quản lý nhân viên này (nếu role=STAFF)',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_users_email` (`email`),
    UNIQUE KEY `uk_users_google_id` (`google_id`),
    KEY `idx_users_role_status` (`role`, `status`),
    KEY `idx_users_organizer` (`created_by_organizer_id`)
) ENGINE=InnoDB;

-- Hồ sơ ban tổ chức (cần Admin phê duyệt)
CREATE TABLE `organizer_profiles` (
    `user_id` BIGINT UNSIGNED NOT NULL,
    `organization_name` VARCHAR(191) NOT NULL,
    `tax_code` VARCHAR(50) DEFAULT NULL,
    `contact_phone` VARCHAR(20) NOT NULL,
    `business_license_url` VARCHAR(255) DEFAULT NULL,
    `approval_status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `approved_by_admin_id` BIGINT UNSIGNED DEFAULT NULL,
    `approved_at` TIMESTAMP NULL DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`user_id`),
    CONSTRAINT `fk_organizer_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Phân công nhân viên cho từng sự kiện và quyền hạn
CREATE TABLE `event_staff_assignments` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `event_id` BIGINT UNSIGNED NOT NULL COMMENT 'Tham chiếu logic sang Event Service',
    `event_title` VARCHAR(255) DEFAULT NULL COMMENT 'Tên sự kiện',
    `staff_user_id` BIGINT UNSIGNED NOT NULL,
    `assigned_by_organizer_id` BIGINT UNSIGNED NOT NULL,
    `staff_role_title` VARCHAR(100) NOT NULL DEFAULT 'Nhân viên Soát vé' COMMENT 'Vai trò/chức danh cụ thể của nhân viên trong sự kiện này',
    `permissions` JSON NOT NULL COMMENT 'Ví dụ: ["CHECKIN", "VIEW_ATTENDEES"]',
    `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_event_staff` (`event_id`, `staff_user_id`),
    CONSTRAINT `fk_assignment_staff` FOREIGN KEY (`staff_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;


-- ==============================================================================
-- 2. EVENT SERVICE DATABASE
-- Quản lý: Sự kiện, địa điểm, khu vực (đứng/ghế), grid map ghế ngồi, loại vé, bảng giá
-- ==============================================================================
CREATE DATABASE IF NOT EXISTS `event_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `event_db`;

DROP TABLE IF EXISTS `ticket_pricing_rules`;
DROP TABLE IF EXISTS `ticket_types`;
DROP TABLE IF EXISTS `seats`;
DROP TABLE IF EXISTS `event_zones`;
DROP TABLE IF EXISTS `events`;
DROP TABLE IF EXISTS `event_categories`;

-- Danh mục sự kiện
CREATE TABLE `event_categories` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `slug` VARCHAR(120) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_category_slug` (`slug`)
) ENGINE=InnoDB;

-- Sự kiện
CREATE TABLE `events` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `organizer_id` BIGINT UNSIGNED NOT NULL COMMENT 'Tham chiếu logic sang Identity Service',
    `category_id` INT UNSIGNED NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `slug` VARCHAR(255) NOT NULL,
    `short_description` VARCHAR(500) DEFAULT NULL,
    `description` LONGTEXT DEFAULT NULL,
    `banner_url` VARCHAR(255) DEFAULT NULL,
    `venue_name` VARCHAR(191) NOT NULL,
    `venue_address` VARCHAR(255) NOT NULL,
    `start_time` DATETIME NOT NULL,
    `end_time` DATETIME NOT NULL,
    `status` ENUM('DRAFT', 'PUBLISHED', 'ON_SALE', 'HAPPENING', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `refund_policy` TEXT DEFAULT NULL COMMENT 'Mô tả chính sách hoàn hủy',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_event_slug` (`slug`),
    KEY `idx_event_status_time` (`status`, `start_time`),
    KEY `idx_event_organizer` (`organizer_id`),
    CONSTRAINT `fk_events_category` FOREIGN KEY (`category_id`) REFERENCES `event_categories` (`id`)
) ENGINE=InnoDB;

-- Khu vực tổ chức (Khu đứng hoặc Khu ghế)
CREATE TABLE `event_zones` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `event_id` BIGINT UNSIGNED NOT NULL,
    `name` VARCHAR(100) NOT NULL COMMENT 'VD: Zone A, Khán đài VIP',
    `zone_type` ENUM('STANDING', 'SEATED') NOT NULL,
    `total_capacity` INT UNSIGNED NOT NULL DEFAULT 0,
    `grid_rows` INT UNSIGNED DEFAULT NULL COMMENT 'Số hàng ghế trong editor (nếu là SEATED)',
    `grid_cols` INT UNSIGNED DEFAULT NULL COMMENT 'Số cột ghế trong editor (nếu là SEATED)',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    CONSTRAINT `fk_zone_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Chi tiết chỗ ngồi trên Grid Map (cho khu vực SEATED)
CREATE TABLE `seats` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `zone_id` BIGINT UNSIGNED NOT NULL,
    `row_index` INT UNSIGNED NOT NULL COMMENT 'Tọa độ hàng trên lưới editor',
    `col_index` INT UNSIGNED NOT NULL COMMENT 'Tọa độ cột trên lưới editor',
    `row_code` VARCHAR(10) NOT NULL COMMENT 'A, B, C...',
    `seat_number` INT UNSIGNED NOT NULL COMMENT '1, 2, 3...',
    `seat_code` VARCHAR(20) NOT NULL COMMENT 'A01, B12...',
    `is_disabled` BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Ghế bị tô đen/vô hiệu hóa',
    `seat_tier` VARCHAR(50) DEFAULT 'STANDARD' COMMENT 'Hạng ghế phân màu trên editor',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_zone_seat_coord` (`zone_id`, `row_index`, `col_index`),
    UNIQUE KEY `uk_zone_seat_code` (`zone_id`, `seat_code`),
    CONSTRAINT `fk_seat_zone` FOREIGN KEY (`zone_id`) REFERENCES `event_zones` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Loại vé
CREATE TABLE `ticket_types` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `event_id` BIGINT UNSIGNED NOT NULL,
    `zone_id` BIGINT UNSIGNED NOT NULL,
    `name` VARCHAR(100) NOT NULL COMMENT 'VIP, Standard, Student',
    `description` VARCHAR(255) DEFAULT NULL,
    `total_quantity` INT UNSIGNED NOT NULL,
    `max_per_order` TINYINT UNSIGNED NOT NULL DEFAULT 4 COMMENT 'Chống đầu cơ: tối đa 4 vé/đơn',
    `is_student_only` BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Ràng buộc email trường học',
    `student_email_domain` VARCHAR(100) DEFAULT NULL COMMENT 'VD: @tdtu.edu.vn',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    CONSTRAINT `fk_tickettype_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_tickettype_zone` FOREIGN KEY (`zone_id`) REFERENCES `event_zones` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Quy tắc giá vé theo thời gian (Early Bird, Regular, Late)
CREATE TABLE `ticket_pricing_rules` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `ticket_type_id` BIGINT UNSIGNED NOT NULL,
    `rule_name` VARCHAR(100) NOT NULL COMMENT 'Early Bird, Regular',
    `price` DECIMAL(12, 2) NOT NULL,
    `start_time` DATETIME NOT NULL,
    `end_time` DATETIME NOT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_pricing_lookup` (`ticket_type_id`, `start_time`, `end_time`),
    CONSTRAINT `fk_pricing_tickettype` FOREIGN KEY (`ticket_type_id`) REFERENCES `ticket_types` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;


-- ==============================================================================
-- 3. BOOKING SERVICE DATABASE
-- Quản lý: Đơn đặt vé, giữ chỗ tạm thời (TTL), điều phối Saga, chống oversell
-- ==============================================================================
CREATE DATABASE IF NOT EXISTS `booking_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `booking_db`;

DROP TABLE IF EXISTS `ticket_inventory`;
DROP TABLE IF EXISTS `seat_reservations`;
DROP TABLE IF EXISTS `booking_items`;
DROP TABLE IF EXISTS `bookings`;

-- Đơn đặt vé
CREATE TABLE `bookings` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `booking_code` VARCHAR(32) NOT NULL COMMENT 'Mã đơn hiển thị cho khách: BK-YYYYMMDD-XXXX',
    `customer_id` BIGINT UNSIGNED NOT NULL COMMENT 'Tham chiếu logic Identity Service',
    `event_id` BIGINT UNSIGNED NOT NULL COMMENT 'Tham chiếu logic Event Service',
    `total_amount` DECIMAL(12, 2) NOT NULL,
    `discount_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `final_amount` DECIMAL(12, 2) NOT NULL,
    `status` ENUM('PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'REFUNDED') NOT NULL DEFAULT 'PENDING_PAYMENT',
    `reserved_until` DATETIME NOT NULL COMMENT 'Hạn chót thanh toán (mặc định 10 phút)',
    `cancellation_reason` VARCHAR(255) DEFAULT NULL,
    `saga_status` ENUM('STARTED', 'PAYMENT_PENDING', 'TICKETING_PENDING', 'COMPLETED', 'COMPENSATING', 'FAILED') DEFAULT 'STARTED',
    `version` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Optimistic locking',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_booking_code` (`booking_code`),
    KEY `idx_customer_bookings` (`customer_id`),
    KEY `idx_booking_status_expiry` (`status`, `reserved_until`)
) ENGINE=InnoDB;

-- Chi tiết các vé trong đơn hàng
CREATE TABLE `booking_items` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `booking_id` BIGINT UNSIGNED NOT NULL,
    `ticket_type_id` BIGINT UNSIGNED NOT NULL,
    `seat_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'NULL nếu là vé khu vực đứng',
    `seat_code_snapshot` VARCHAR(20) DEFAULT NULL,
    `unit_price` DECIMAL(12, 2) NOT NULL,
    `quantity` INT UNSIGNED NOT NULL DEFAULT 1,
    `attendee_name` VARCHAR(100) DEFAULT NULL,
    `attendee_email` VARCHAR(191) DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    CONSTRAINT `fk_item_booking` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Quản lý giữ chỗ ghế (cho khu vực SEATED)
CREATE TABLE `seat_reservations` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `event_id` BIGINT UNSIGNED NOT NULL,
    `seat_id` BIGINT UNSIGNED NOT NULL,
    `booking_id` BIGINT UNSIGNED NOT NULL,
    `status` ENUM('HOLD', 'SOLD', 'RELEASED') NOT NULL DEFAULT 'HOLD',
    `hold_expires_at` DATETIME NOT NULL,
    `version` INT UNSIGNED NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_seat_active_hold` (`seat_id`, `status`, `hold_expires_at`),
    KEY `idx_booking_reservations` (`booking_id`)
) ENGINE=InnoDB;

-- Quản lý tồn kho vé (cho khu vực STANDING)
CREATE TABLE `ticket_inventory` (
    `ticket_type_id` BIGINT UNSIGNED NOT NULL,
    `total_quota` INT UNSIGNED NOT NULL,
    `reserved_quantity` INT UNSIGNED NOT NULL DEFAULT 0,
    `sold_quantity` INT UNSIGNED NOT NULL DEFAULT 0,
    `version` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Optimistic locking để trừ tồn kho an toàn',
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`ticket_type_id`)
) ENGINE=InnoDB;


-- ==============================================================================
-- 4. PAYMENT SERVICE DATABASE
-- Quản lý: Thanh toán (Mock/VNPay), Callback Webhook, Idempotency, Hoàn tiền
-- ==============================================================================
CREATE DATABASE IF NOT EXISTS `payment_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `payment_db`;

DROP TABLE IF EXISTS `payment_refunds`;
DROP TABLE IF EXISTS `idempotency_records`;
DROP TABLE IF EXISTS `payments`;

-- Giao dịch thanh toán
CREATE TABLE `payments` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `payment_code` VARCHAR(64) NOT NULL COMMENT 'PAY-YYYYMMDD-XXXX',
    `booking_id` BIGINT UNSIGNED NOT NULL COMMENT 'Tham chiếu logic Booking Service',
    `customer_id` BIGINT UNSIGNED NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `currency` VARCHAR(10) NOT NULL DEFAULT 'VND',
    `payment_method` ENUM('VNPAY_SANDBOX', 'MOCK_GATEWAY') NOT NULL DEFAULT 'MOCK_GATEWAY',
    `status` ENUM('PENDING', 'SUCCESS', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `gateway_transaction_no` VARCHAR(100) DEFAULT NULL,
    `gateway_response_raw` JSON DEFAULT NULL,
    `idempotency_key` VARCHAR(128) NOT NULL COMMENT 'Khóa chống thanh toán trùng',
    `paid_at` DATETIME DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_payment_code` (`payment_code`),
    UNIQUE KEY `uk_payment_idempotency` (`idempotency_key`),
    KEY `idx_payment_booking` (`booking_id`)
) ENGINE=InnoDB;

-- Giao dịch hoàn tiền (Refund)
CREATE TABLE `payment_refunds` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `payment_id` BIGINT UNSIGNED NOT NULL,
    `booking_id` BIGINT UNSIGNED NOT NULL,
    `refund_amount` DECIMAL(12, 2) NOT NULL,
    `reason` VARCHAR(255) NOT NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `gateway_refund_id` VARCHAR(100) DEFAULT NULL,
    `error_details` TEXT DEFAULT NULL,
    `processed_at` DATETIME DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_refund_payment` (`payment_id`),
    CONSTRAINT `fk_refund_payment` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`)
) ENGINE=InnoDB;

-- Chống lặp callback/webhook
CREATE TABLE `idempotency_records` (
    `idempotency_key` VARCHAR(128) NOT NULL,
    `handler_name` VARCHAR(100) NOT NULL,
    `request_hash` VARCHAR(64) NOT NULL,
    `response_body` JSON DEFAULT NULL,
    `status` ENUM('IN_PROGRESS', 'COMPLETED', 'FAILED') NOT NULL,
    `expires_at` DATETIME NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`idempotency_key`)
) ENGINE=InnoDB;


-- ==============================================================================
-- 5. TICKET SERVICE DATABASE
-- Quản lý: Phát hành vé điện tử, QR Code có chữ ký số bảo mật, Check-in tại cổng
-- ==============================================================================
CREATE DATABASE IF NOT EXISTS `ticket_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `ticket_db`;

DROP TABLE IF EXISTS `checkin_logs`;
DROP TABLE IF EXISTS `tickets`;

-- Vé điện tử
CREATE TABLE `tickets` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `ticket_code` VARCHAR(64) NOT NULL COMMENT 'Mã vé định danh duy nhất',
    `booking_id` BIGINT UNSIGNED NOT NULL COMMENT 'Tham chiếu logic Booking Service',
    `event_id` BIGINT UNSIGNED NOT NULL COMMENT 'Tham chiếu logic Event Service',
    `ticket_type_id` BIGINT UNSIGNED NOT NULL,
    `seat_id` BIGINT UNSIGNED DEFAULT NULL,
    `seat_code` VARCHAR(20) DEFAULT NULL COMMENT 'A01, B02 (snapshot)',
    `customer_id` BIGINT UNSIGNED NOT NULL,
    `attendee_name` VARCHAR(100) NOT NULL,
    `attendee_email` VARCHAR(191) NOT NULL,
    `qr_payload` TEXT NOT NULL COMMENT 'Chứa thông tin xác thực',
    `qr_signature` VARCHAR(255) NOT NULL COMMENT 'Chữ ký số chống làm giả (HMAC-SHA256 hoặc RSA)',
    `status` ENUM('ISSUED', 'CHECKED_IN', 'CANCELLED', 'REFUNDED') NOT NULL DEFAULT 'ISSUED',
    `checked_in_at` DATETIME DEFAULT NULL,
    `version` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Dùng cho conditional update khi check-in đồng thời',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_ticket_code` (`ticket_code`),
    KEY `idx_tickets_event_status` (`event_id`, `status`),
    KEY `idx_tickets_customer` (`customer_id`),
    KEY `idx_tickets_booking` (`booking_id`)
) ENGINE=InnoDB;

-- Lịch sử quét Check-in
CREATE TABLE `checkin_logs` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `ticket_id` BIGINT UNSIGNED NOT NULL,
    `event_id` BIGINT UNSIGNED NOT NULL,
    `scanned_by_staff_id` BIGINT UNSIGNED NOT NULL,
    `scan_result` ENUM('SUCCESS', 'ALREADY_CHECKED_IN', 'INVALID_EVENT', 'INVALID_SIGNATURE', 'TICKET_CANCELLED') NOT NULL,
    `device_info` VARCHAR(255) DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_checkin_ticket` (`ticket_id`),
    CONSTRAINT `fk_log_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`)
) ENGINE=InnoDB;


-- ==============================================================================
-- 6. NOTIFICATION SERVICE DATABASE
-- Quản lý: Mẫu thông báo, nhật ký gửi Email/SMS/In-app, Retry cơ chế
-- ==============================================================================
CREATE DATABASE IF NOT EXISTS `notification_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `notification_db`;

DROP TABLE IF EXISTS `notifications`;
DROP TABLE IF EXISTS `notification_templates`;

-- Mẫu nội dung thông báo
CREATE TABLE `notification_templates` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `template_code` VARCHAR(50) NOT NULL COMMENT 'VD: BOOKING_SUCCESS, TICKET_ISSUED, EVENT_CANCELLED',
    `channel` ENUM('EMAIL', 'SMS', 'IN_APP') NOT NULL DEFAULT 'EMAIL',
    `subject_template` VARCHAR(255) NOT NULL,
    `body_template` LONGTEXT NOT NULL COMMENT 'Hỗ trợ HTML và placeholders',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_template_code_channel` (`template_code`, `channel`)
) ENGINE=InnoDB;

-- Lịch sử gửi thông báo
CREATE TABLE `notifications` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `recipient_user_id` BIGINT UNSIGNED NOT NULL,
    `recipient_destination` VARCHAR(191) NOT NULL COMMENT 'Email hoặc SĐT',
    `channel` ENUM('EMAIL', 'SMS', 'IN_APP') NOT NULL DEFAULT 'EMAIL',
    `template_code` VARCHAR(50) NOT NULL,
    `rendered_subject` VARCHAR(255) NOT NULL,
    `rendered_content` LONGTEXT NOT NULL,
    `event_reference_id` BIGINT UNSIGNED DEFAULT NULL,
    `status` ENUM('PENDING', 'SENT', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `retry_count` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `error_log` TEXT DEFAULT NULL,
    `sent_at` DATETIME DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_noti_status_retry` (`status`, `retry_count`),
    KEY `idx_noti_recipient` (`recipient_user_id`)
) ENGINE=InnoDB;


-- ==============================================================================
-- 7. REPORTING SERVICE DATABASE
-- Quản lý: Bảng tổng hợp số liệu Dashboard Organizer, Admin, Báo cáo đối soát
-- ==============================================================================
CREATE DATABASE IF NOT EXISTS `reporting_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `reporting_db`;

DROP TABLE IF EXISTS `settlement_reports`;
DROP TABLE IF EXISTS `daily_sales_stats`;
DROP TABLE IF EXISTS `event_sales_summaries`;

-- Bảng tổng hợp số liệu theo sự kiện (CQRS Read Model)
CREATE TABLE `event_sales_summaries` (
    `event_id` BIGINT UNSIGNED NOT NULL,
    `organizer_id` BIGINT UNSIGNED NOT NULL,
    `total_seats_capacity` INT UNSIGNED NOT NULL DEFAULT 0,
    `total_tickets_reserved` INT UNSIGNED NOT NULL DEFAULT 0,
    `total_tickets_sold` INT UNSIGNED NOT NULL DEFAULT 0,
    `total_tickets_checked_in` INT UNSIGNED NOT NULL DEFAULT 0,
    `gross_revenue` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `total_refunded_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `net_revenue` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `last_event_time` DATETIME DEFAULT NULL,
    `last_updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`event_id`),
    KEY `idx_summary_organizer` (`organizer_id`)
) ENGINE=InnoDB;

-- Doanh số theo ngày (vẽ biểu đồ vận tốc bán vé)
CREATE TABLE `daily_sales_stats` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `event_id` BIGINT UNSIGNED NOT NULL,
    `stat_date` DATE NOT NULL,
    `tickets_sold_count` INT UNSIGNED NOT NULL DEFAULT 0,
    `daily_revenue` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_event_daily_stat` (`event_id`, `stat_date`)
) ENGINE=InnoDB;

-- Báo cáo đối soát doanh thu cho Organizer sau khi trừ phí nền tảng
CREATE TABLE `settlement_reports` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `settlement_code` VARCHAR(50) NOT NULL COMMENT 'SETTLE-YYYYMMDD-XXXX',
    `event_id` BIGINT UNSIGNED NOT NULL,
    `organizer_id` BIGINT UNSIGNED NOT NULL,
    `gross_sales` DECIMAL(15, 2) NOT NULL,
    `platform_fee_percent` DECIMAL(5, 2) NOT NULL DEFAULT 5.00 COMMENT 'Phí nền tảng (ví dụ 5%)',
    `platform_fee_amount` DECIMAL(15, 2) NOT NULL,
    `payout_amount` DECIMAL(15, 2) NOT NULL COMMENT 'Số tiền thực tế chi trả',
    `status` ENUM('PENDING', 'APPROVED', 'TRANSFERRED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `settled_at` DATETIME DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_settle_event` (`event_id`)
) ENGINE=InnoDB;
