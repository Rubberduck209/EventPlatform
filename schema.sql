-- ==============================================================================
-- ĐỒ ÁN CUỐI KỲ: MÔN KIẾN TRÚC HƯỚNG DỊCH VỤ (SOA)
-- HỆ THỐNG: NỀN TẢNG QUẢN LÝ SỰ KIỆN VÀ BÁN VÉ (EVENT MANAGEMENT PLATFORM)
-- KIẾN TRÚC: Database-per-Service (MySQL 8.0+)
-- FILE: schema.sql (Bao gồm Cấu trúc Bảng & Dữ liệu Mẫu Seed Test)
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
-- DỮ LIỆU TEST MẪU (SEED DATA) CHO IDENTITY SERVICE
-- Mật khẩu mặc định cho tất cả các tài khoản mẫu: 123456
-- Chuỗi hash chuẩn bcrypt: $2b$10$9wE.I6uLrQ.xrM3aKVkg3uxp6KgU/cRcpR/2PItJcoZEEZ2OAEGOy
-- ==============================================================================
INSERT INTO `users` (`id`, `email`, `password_hash`, `full_name`, `phone`, `role`, `status`, `auth_provider`, `created_by_organizer_id`) VALUES
(1, 'admin', '$2b$10$9wE.I6uLrQ.xrM3aKVkg3uxp6KgU/cRcpR/2PItJcoZEEZ2OAEGOy', 'Quản Trị Viên Hệ Thống', '0999999999', 'ADMIN', 'ACTIVE', 'LOCAL', NULL),
(2, 'admin@platform.com', '$2b$10$9wE.I6uLrQ.xrM3aKVkg3uxp6KgU/cRcpR/2PItJcoZEEZ2OAEGOy', 'Platform Administrator', '0999999999', 'ADMIN', 'ACTIVE', 'LOCAL', NULL),
(3, 'customer1@gmail.com', '$2b$10$9wE.I6uLrQ.xrM3aKVkg3uxp6KgU/cRcpR/2PItJcoZEEZ2OAEGOy', 'Nguyễn Văn An', '0901111222', 'CUSTOMER', 'ACTIVE', 'LOCAL', NULL),
(4, 'customer2@gmail.com', '$2b$10$9wE.I6uLrQ.xrM3aKVkg3uxp6KgU/cRcpR/2PItJcoZEEZ2OAEGOy', 'Trần Thị Bích', '0902222333', 'CUSTOMER', 'ACTIVE', 'LOCAL', NULL),
(5, 'customer3@gmail.com', '$2b$10$9wE.I6uLrQ.xrM3aKVkg3uxp6KgU/cRcpR/2PItJcoZEEZ2OAEGOy', 'Lê Hoàng Nam', '0903333444', 'CUSTOMER', 'ACTIVE', 'LOCAL', NULL),
(6, 'organizer@gmail.com', '$2b$10$9wE.I6uLrQ.xrM3aKVkg3uxp6KgU/cRcpR/2PItJcoZEEZ2OAEGOy', 'Công ty Sự Kiện TDTU', '0918888999', 'ORGANIZER', 'ACTIVE', 'LOCAL', NULL),
(7, 'staff@gmail.com', '$2b$10$9wE.I6uLrQ.xrM3aKVkg3uxp6KgU/cRcpR/2PItJcoZEEZ2OAEGOy', 'Phạm Minh Quân', '0987654321', 'STAFF', 'ACTIVE', 'LOCAL', 6);

INSERT INTO `organizer_profiles` (`user_id`, `organization_name`, `tax_code`, `contact_phone`, `business_license_url`, `approval_status`, `approved_by_admin_id`, `approved_at`) VALUES
(6, 'Công ty TNHH Tổ Chức Sự Kiện TDTU', '0312345678', '0918888999', 'https://example.com/giay-phep-tdtu.pdf', 'APPROVED', 1, NOW());

INSERT INTO `event_staff_assignments` (`id`, `event_id`, `event_title`, `staff_user_id`, `assigned_by_organizer_id`, `staff_role_title`, `permissions`, `is_active`) VALUES
(1, 1, 'TDTU Music Festival 2027', 7, 6, 'Nhân viên Soát vé Cổng A', '["CHECKIN", "VIEW_ATTENDEES"]', 1);


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
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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
    `description` TEXT DEFAULT NULL,
    `banner_url` VARCHAR(255) DEFAULT NULL,
    `venue_name` VARCHAR(191) NOT NULL,
    `venue_address` VARCHAR(255) NOT NULL,
    `start_time` DATETIME NOT NULL,
    `end_time` DATETIME NOT NULL,
    `status` ENUM('DRAFT', 'PUBLISHED', 'ON_SALE', 'HAPPENING', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `refund_policy` TEXT DEFAULT NULL,
    `cancel_reason` TEXT DEFAULT NULL COMMENT 'Lý do hủy sự kiện',
    `cancelled_at` DATETIME DEFAULT NULL COMMENT 'Thời điểm hủy sự kiện',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_events_slug` (`slug`),
    KEY `idx_events_organizer` (`organizer_id`),
    KEY `idx_events_status_time` (`status`, `start_time`),
    CONSTRAINT `fk_event_category` FOREIGN KEY (`category_id`) REFERENCES `event_categories` (`id`)
) ENGINE=InnoDB;

-- Phân khu sự kiện (Zone)
CREATE TABLE `event_zones` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `event_id` BIGINT UNSIGNED NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `zone_type` ENUM('STANDING', 'SEATED') NOT NULL,
    `total_capacity` INT UNSIGNED NOT NULL DEFAULT 0,
    `grid_rows` INT UNSIGNED DEFAULT NULL COMMENT 'Số hàng ghế nếu là SEATED (A..Z)',
    `grid_cols` INT UNSIGNED DEFAULT NULL COMMENT 'Số cột ghế nếu là SEATED (1..50)',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_zone_event` (`event_id`),
    CONSTRAINT `fk_zone_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Sơ đồ ghế ngồi theo lưới Grid Map
CREATE TABLE `seats` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `zone_id` BIGINT UNSIGNED NOT NULL,
    `row_index` INT UNSIGNED NOT NULL COMMENT 'Chỉ số hàng: 0, 1, 2...',
    `col_index` INT UNSIGNED NOT NULL COMMENT 'Chỉ số cột: 0, 1, 2...',
    `row_code` VARCHAR(10) NOT NULL COMMENT 'Mã hàng hiển thị: A, B, C...',
    `seat_number` INT UNSIGNED NOT NULL COMMENT 'Số thứ tự ghế: 1, 2, 3...',
    `seat_code` VARCHAR(20) NOT NULL COMMENT 'Mã ghế: A01, B12...',
    `is_disabled` BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Ghế bị vô hiệu hóa/bôi đen: lối đi, cột nhà',
    `seat_tier` VARCHAR(50) NOT NULL DEFAULT 'STANDARD' COMMENT 'Phân màu hạng ghế: VIP, STANDARD, STUDENT',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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
    `name` VARCHAR(100) NOT NULL,
    `description` VARCHAR(255) DEFAULT NULL,
    `total_quantity` INT UNSIGNED NOT NULL,
    `max_per_order` INT UNSIGNED NOT NULL DEFAULT 4 COMMENT 'Chống đầu cơ',
    `is_student_only` BOOLEAN NOT NULL DEFAULT FALSE,
    `student_email_domain` VARCHAR(100) DEFAULT NULL,
    `sale_start_time` DATETIME DEFAULT NULL COMMENT 'Thời điểm bắt đầu bán vé',
    `sale_end_time` DATETIME DEFAULT NULL COMMENT 'Thời điểm kết thúc bán vé (mặc định trước thời gian diễn ra sự kiện)',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_ticket_event` (`event_id`),
    KEY `idx_ticket_zone` (`zone_id`),
    CONSTRAINT `fk_ticket_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_ticket_zone` FOREIGN KEY (`zone_id`) REFERENCES `event_zones` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Quy tắc giá vé động
CREATE TABLE `ticket_pricing_rules` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `ticket_type_id` BIGINT UNSIGNED NOT NULL,
    `rule_name` VARCHAR(100) NOT NULL,
    `price` DECIMAL(12, 2) NOT NULL,
    `start_time` DATETIME NOT NULL,
    `end_time` DATETIME NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_pricing_ticket` (`ticket_type_id`, `start_time`, `end_time`),
    CONSTRAINT `fk_pricing_ticket` FOREIGN KEY (`ticket_type_id`) REFERENCES `ticket_types` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ==============================================================================
-- DỮ LIỆU TEST MẪU (SEED DATA) CHO EVENT SERVICE
-- ==============================================================================
INSERT INTO `event_categories` (`id`, `name`, `slug`) VALUES
(1, 'Âm nhạc & Concert', 'am-nhac-concert'),
(2, 'Hội thảo & Công nghệ', 'hoi-thao-cong-nghe'),
(3, 'Thể thao & Giải trí', 'the-thao-giai-tri'),
(4, 'Văn hóa & Nghệ thuật', 'van-hoa-nghe-thuat');

-- 2 Sự kiện mẫu mở bán
INSERT INTO `events` (`id`, `organizer_id`, `category_id`, `title`, `slug`, `short_description`, `description`, `venue_name`, `venue_address`, `start_time`, `end_time`, `status`, `refund_policy`) VALUES
(1, 6, 1, 'TDTU Music Festival 2027', 'tdtu-music-festival-2027', 'Đại nhạc hội sinh viên và công nghệ âm thanh ánh sáng 2027.', 'Sự kiện âm nhạc quy mô lớn với khu vực Khán đài ghế ngồi VIP/Standard và khu vực Fanzone đứng.', 'Sân vận động Đại học Tôn Đức Thắng', '19 Nguyễn Hữu Thọ, Phường Tân Phong, Quận 7, TP.HCM', DATE_ADD(NOW(), INTERVAL 30 DAY), DATE_ADD(NOW(), INTERVAL 30 DAY) + INTERVAL 4 HOUR, 'ON_SALE', 'Hoàn tiền 100% nếu hủy vé trước 7 ngày diễn ra sự kiện.'),
(2, 6, 2, 'AI & Cloud Microservices Summit 2027', 'ai-cloud-microservices-summit-2027', 'Hội thảo chuyên sâu về Kiến trúc Hướng Dịch vụ, Cloud Native và AI.', 'Quy tụ các diễn giả công nghệ hàng đầu chia sẻ về thiết kế hệ thống phân tán chịu tải cao.', 'Hội trường 6B - Đại học Tôn Đức Thắng', '19 Nguyễn Hữu Thọ, Phường Tân Phong, Quận 7, TP.HCM', DATE_ADD(NOW(), INTERVAL 20 DAY), DATE_ADD(NOW(), INTERVAL 20 DAY) + INTERVAL 3 HOUR, 'ON_SALE', 'Hoàn tiền 100% trước 48 giờ diễn ra hội thảo.');

-- Khu vực cho Sự kiện 1
INSERT INTO `event_zones` (`id`, `event_id`, `name`, `zone_type`, `total_capacity`, `grid_rows`, `grid_cols`) VALUES
(1, 1, 'Khán đài A', 'SEATED', 30, 4, 8),
(2, 1, 'Khu Fanzone Đứng', 'STANDING', 500, NULL, NULL),
(3, 2, 'Hội trường Trung tâm', 'SEATED', 30, 3, 10);

-- Sinh ghế cho Khán đài A (Sự kiện 1: 4 hàng A..D x 8 cột, D04 và D05 bôi đen làm lối đi)
INSERT INTO `seats` (`zone_id`, `row_index`, `col_index`, `row_code`, `seat_number`, `seat_code`, `is_disabled`, `seat_tier`) VALUES
(1, 0, 0, 'A', 1, 'A01', 0, 'VIP'), (1, 0, 1, 'A', 2, 'A02', 0, 'VIP'), (1, 0, 2, 'A', 3, 'A03', 0, 'VIP'), (1, 0, 3, 'A', 4, 'A04', 0, 'VIP'),
(1, 0, 4, 'A', 5, 'A05', 0, 'VIP'), (1, 0, 5, 'A', 6, 'A06', 0, 'VIP'), (1, 0, 6, 'A', 7, 'A07', 0, 'VIP'), (1, 0, 7, 'A', 8, 'A08', 0, 'VIP'),
(1, 1, 0, 'B', 1, 'B01', 0, 'VIP'), (1, 1, 1, 'B', 2, 'B02', 0, 'VIP'), (1, 1, 2, 'B', 3, 'B03', 0, 'VIP'), (1, 1, 3, 'B', 4, 'B04', 0, 'VIP'),
(1, 1, 4, 'B', 5, 'B05', 0, 'VIP'), (1, 1, 5, 'B', 6, 'B06', 0, 'VIP'), (1, 1, 6, 'B', 7, 'B07', 0, 'VIP'), (1, 1, 7, 'B', 8, 'B08', 0, 'VIP'),
(1, 2, 0, 'C', 1, 'C01', 0, 'STANDARD'), (1, 2, 1, 'C', 2, 'C02', 0, 'STANDARD'), (1, 2, 2, 'C', 3, 'C03', 0, 'STANDARD'), (1, 2, 3, 'C', 4, 'C04', 0, 'STANDARD'),
(1, 2, 4, 'C', 5, 'C05', 0, 'STANDARD'), (1, 2, 5, 'C', 6, 'C06', 0, 'STANDARD'), (1, 2, 6, 'C', 7, 'C07', 0, 'STANDARD'), (1, 2, 7, 'C', 8, 'C08', 0, 'STANDARD'),
(1, 3, 0, 'D', 1, 'D01', 0, 'STANDARD'), (1, 3, 1, 'D', 2, 'D02', 0, 'STANDARD'), (1, 3, 2, 'D', 3, 'D03', 0, 'STANDARD'),
(1, 3, 3, 'D', 4, 'D04', 1, 'STANDARD'), (1, 3, 4, 'D', 5, 'D05', 1, 'STANDARD'), -- Lối đi
(1, 3, 5, 'D', 6, 'D06', 0, 'STANDARD'), (1, 3, 6, 'D', 7, 'D07', 0, 'STANDARD'), (1, 3, 7, 'D', 8, 'D08', 0, 'STANDARD');

-- Sinh ghế cho Hội trường Trung tâm (Sự kiện 2: 3 hàng A..C x 10 cột = 30 ghế)
INSERT INTO `seats` (`zone_id`, `row_index`, `col_index`, `row_code`, `seat_number`, `seat_code`, `is_disabled`, `seat_tier`) VALUES
(3, 0, 0, 'A', 1, 'A01', 0, 'STUDENT'), (3, 0, 1, 'A', 2, 'A02', 0, 'STUDENT'), (3, 0, 2, 'A', 3, 'A03', 0, 'STUDENT'), (3, 0, 3, 'A', 4, 'A04', 0, 'STUDENT'), (3, 0, 4, 'A', 5, 'A05', 0, 'STUDENT'),
(3, 0, 5, 'A', 6, 'A06', 0, 'STUDENT'), (3, 0, 6, 'A', 7, 'A07', 0, 'STUDENT'), (3, 0, 7, 'A', 8, 'A08', 0, 'STUDENT'), (3, 0, 8, 'A', 9, 'A09', 0, 'STUDENT'), (3, 0, 9, 'A', 10, 'A10', 0, 'STUDENT'),
(3, 1, 0, 'B', 1, 'B01', 0, 'STANDARD'), (3, 1, 1, 'B', 2, 'B02', 0, 'STANDARD'), (3, 1, 2, 'B', 3, 'B03', 0, 'STANDARD'), (3, 1, 3, 'B', 4, 'B04', 0, 'STANDARD'), (3, 1, 4, 'B', 5, 'B05', 0, 'STANDARD'),
(3, 1, 5, 'B', 6, 'B06', 0, 'STANDARD'), (3, 1, 6, 'B', 7, 'B07', 0, 'STANDARD'), (3, 1, 7, 'B', 8, 'B08', 0, 'STANDARD'), (3, 1, 8, 'B', 9, 'B09', 0, 'STANDARD'), (3, 1, 9, 'B', 10, 'B10', 0, 'STANDARD'),
(3, 2, 0, 'C', 1, 'C01', 0, 'STANDARD'), (3, 2, 1, 'C', 2, 'C02', 0, 'STANDARD'), (3, 2, 2, 'C', 3, 'C03', 0, 'STANDARD'), (3, 2, 3, 'C', 4, 'C04', 0, 'STANDARD'), (3, 2, 4, 'C', 5, 'C05', 0, 'STANDARD'),
(3, 2, 5, 'C', 6, 'C06', 0, 'STANDARD'), (3, 2, 6, 'C', 7, 'C07', 0, 'STANDARD'), (3, 2, 7, 'C', 8, 'C08', 0, 'STANDARD'), (3, 2, 8, 'C', 9, 'C09', 0, 'STANDARD'), (3, 2, 9, 'C', 10, 'C10', 0, 'STANDARD');

-- Các hạng vé (Sự kiện 1: Khán đài A có 16 ghế VIP + 14 ghế Thường; Khu Fanzone đứng có 300 vé Thường + 200 vé SV)
INSERT INTO `ticket_types` (`id`, `event_id`, `zone_id`, `name`, `description`, `total_quantity`, `max_per_order`, `is_student_only`, `student_email_domain`) VALUES
(1, 1, 1, 'Vé VIP', 'Ghế ngồi hàng A-B tầm nhìn trực diện sân khấu', 16, 4, 0, NULL),
(2, 1, 1, 'Vé Ghế Thường', 'Ghế ngồi tiêu chuẩn hàng C-D Khán đài A', 14, 4, 0, NULL),
(3, 1, 2, 'Vé Đứng Fanzone', 'Vé khu vực đứng tự do quanh sân khấu', 300, 4, 0, NULL),
(4, 1, 2, 'Vé Đứng Sinh Viên', 'Chỉ dành cho tài khoản email trường học @tdtu.edu.vn', 200, 4, 1, '@tdtu.edu.vn'),
(5, 2, 3, 'Vé Tham dự Tiêu chuẩn', 'Bao gồm tài liệu hội thảo và teabreak', 20, 4, 0, NULL),
(6, 2, 3, 'Vé Sinh viên TDTU', 'Ưu đãi dành riêng cho sinh viên có email @tdtu.edu.vn', 10, 2, 1, '@tdtu.edu.vn');

-- Bảng giá vé động Early Bird & Regular
INSERT INTO `ticket_pricing_rules` (`ticket_type_id`, `rule_name`, `price`, `start_time`, `end_time`) VALUES
(1, 'Early Bird', 450000.00, DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 10 DAY)),
(1, 'Regular', 600000.00, DATE_ADD(NOW(), INTERVAL 10 DAY), DATE_ADD(NOW(), INTERVAL 30 DAY)),
(2, 'Early Bird', 300000.00, DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 10 DAY)),
(2, 'Regular', 400000.00, DATE_ADD(NOW(), INTERVAL 10 DAY), DATE_ADD(NOW(), INTERVAL 30 DAY)),
(3, 'Early Bird', 200000.00, DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 10 DAY)),
(3, 'Regular', 300000.00, DATE_ADD(NOW(), INTERVAL 10 DAY), DATE_ADD(NOW(), INTERVAL 30 DAY)),
(4, 'Early Bird', 120000.00, DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 10 DAY)),
(4, 'Regular', 180000.00, DATE_ADD(NOW(), INTERVAL 10 DAY), DATE_ADD(NOW(), INTERVAL 30 DAY)),
(5, 'Early Bird', 150000.00, DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 10 DAY)),
(5, 'Regular', 250000.00, DATE_ADD(NOW(), INTERVAL 10 DAY), DATE_ADD(NOW(), INTERVAL 20 DAY)),
(6, 'Early Bird', 50000.00, DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 10 DAY)),
(6, 'Regular', 90000.00, DATE_ADD(NOW(), INTERVAL 10 DAY), DATE_ADD(NOW(), INTERVAL 20 DAY));


-- ==============================================================================
-- 3. PAYMENT SERVICE DATABASE
-- Quản lý: Giao dịch thanh toán (VNPay Sandbox), Lịch sử hoàn tiền, Idempotency
-- ==============================================================================
CREATE DATABASE IF NOT EXISTS `payment_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `payment_db`;

DROP TABLE IF EXISTS `idempotency_records`;
DROP TABLE IF EXISTS `payment_refunds`;
DROP TABLE IF EXISTS `payments`;

-- Bảng thanh toán
CREATE TABLE `payments` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `payment_code` VARCHAR(64) NOT NULL COMMENT 'PAY-YYYYMMDD-XXXX',
    `booking_id` BIGINT UNSIGNED NOT NULL COMMENT 'Tham chiếu logic sang Booking Service',
    `customer_id` BIGINT UNSIGNED NOT NULL COMMENT 'Tham chiếu logic sang Identity Service',
    `amount` DECIMAL(12, 2) NOT NULL,
    `currency` VARCHAR(10) NOT NULL DEFAULT 'VND',
    `payment_method` ENUM('VNPAY_SANDBOX', 'MOCK_GATEWAY') NOT NULL DEFAULT 'VNPAY_SANDBOX',
    `status` ENUM('PENDING', 'SUCCESS', 'FAILED', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    `gateway_transaction_no` VARCHAR(100) DEFAULT NULL,
    `gateway_response_raw` JSON DEFAULT NULL,
    `idempotency_key` VARCHAR(128) NOT NULL,
    `paid_at` DATETIME DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_payment_code` (`payment_code`),
    UNIQUE KEY `uk_idempotency_key` (`idempotency_key`),
    KEY `idx_payment_booking` (`booking_id`),
    KEY `idx_payment_customer` (`customer_id`)
) ENGINE=InnoDB;

-- Bảng hoàn tiền
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
    CONSTRAINT `fk_refund_payment` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Bảng chống trùng lặp giao dịch (Idempotency)
CREATE TABLE `idempotency_records` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `idempotency_key` VARCHAR(128) NOT NULL,
    `handler_name` VARCHAR(100) NOT NULL,
    `request_hash` VARCHAR(64) NOT NULL,
    `response_body` JSON DEFAULT NULL,
    `status` ENUM('IN_PROGRESS', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'IN_PROGRESS',
    `expires_at` DATETIME NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_idempotency_record` (`idempotency_key`),
    KEY `idx_idempotency_expires` (`expires_at`)
) ENGINE=InnoDB;

-- ==============================================================================
-- DỮ LIỆU TEST MẪU (SEED DATA) CHO PAYMENT SERVICE
-- ==============================================================================
INSERT INTO `payments` (`id`, `payment_code`, `booking_id`, `customer_id`, `amount`, `currency`, `payment_method`, `status`, `gateway_transaction_no`, `idempotency_key`, `paid_at`) VALUES
(1, 'PAY-20270501-8931', 101, 3, 450000.00, 'VND', 'VNPAY_SANDBOX', 'SUCCESS', '14592031', 'seed-idem-key-pay-101', DATE_SUB(NOW(), INTERVAL 2 DAY)),
(2, 'PAY-20270502-4412', 102, 3, 200000.00, 'VND', 'VNPAY_SANDBOX', 'SUCCESS', '14592032', 'seed-idem-key-pay-102', DATE_SUB(NOW(), INTERVAL 1 DAY));

INSERT INTO `payment_refunds` (`id`, `payment_id`, `booking_id`, `refund_amount`, `reason`, `status`, `gateway_refund_id`, `processed_at`) VALUES
(1, 2, 102, 200000.00, 'Khách hàng yêu cầu hủy vé trước 7 ngày theo chính sách.', 'SUCCESS', 'VNP-REF-20270502-9901', NOW());


-- ==============================================================================
-- 4. BOOKING SERVICE DATABASE (Chuẩn mô hình Booking Service Port 8003)
-- ==============================================================================
CREATE DATABASE IF NOT EXISTS `booking_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `booking_db`;

DROP TABLE IF EXISTS `seat_reservations`;
DROP TABLE IF EXISTS `booking_items`;
DROP TABLE IF EXISTS `ticket_inventory`;
DROP TABLE IF EXISTS `bookings`;

CREATE TABLE `bookings` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `user_id` VARCHAR(50) NOT NULL,
    `event_id` VARCHAR(50) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING_PAYMENT' COMMENT 'PENDING_PAYMENT, CONFIRMED, CANCELLED, EXPIRED',
    `total_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `created_at` DATETIME NOT NULL,
    `expires_at` DATETIME NOT NULL COMMENT 'Hết hạn giữ chỗ sau 10 phút',
    PRIMARY KEY (`id`),
    KEY `idx_booking_user` (`user_id`),
    KEY `idx_booking_event` (`event_id`)
) ENGINE=InnoDB;

CREATE TABLE `booking_items` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `booking_id` INT NOT NULL,
    `ticket_type_id` VARCHAR(50) NOT NULL,
    `seat_id` VARCHAR(50) DEFAULT NULL COMMENT 'Ghế ngồi: có mã ghế; Vé đứng: để trống',
    `quantity` INT NOT NULL DEFAULT 1,
    `unit_price` DECIMAL(12, 2) NOT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_item_booking` (`booking_id`),
    CONSTRAINT `ck_item_qty_positive` CHECK (`quantity` > 0),
    CONSTRAINT `fk_booking_items_booking` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE `seat_reservations` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `event_id` VARCHAR(50) NOT NULL,
    `seat_id` VARCHAR(50) NOT NULL,
    `booking_id` INT NOT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'HELD' COMMENT 'HELD, SOLD, RELEASED',
    `active_seat_key` VARCHAR(110) GENERATED ALWAYS AS (IF(`status` IN ('HELD','SOLD'), CONCAT(`event_id`, ':', `seat_id`), NULL)) STORED,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_active_seat_key` (`active_seat_key`),
    KEY `idx_res_event` (`event_id`),
    KEY `idx_res_booking` (`booking_id`),
    CONSTRAINT `fk_seat_res_booking` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE `ticket_inventory` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `event_id` VARCHAR(50) NOT NULL,
    `ticket_type_id` VARCHAR(50) NOT NULL,
    `total_quantity` INT NOT NULL,
    `held_quantity` INT NOT NULL DEFAULT 0,
    `sold_quantity` INT NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_inventory_event_type` (`event_id`, `ticket_type_id`),
    CONSTRAINT `ck_inv_non_negative` CHECK (`held_quantity` >= 0 AND `sold_quantity` >= 0),
    CONSTRAINT `ck_inv_no_oversell` CHECK (`held_quantity` + `sold_quantity` <= `total_quantity`)
) ENGINE=InnoDB;

-- Dữ liệu mẫu (Seed Data) cho Booking Service
INSERT INTO `bookings` (`id`, `user_id`, `event_id`, `status`, `total_amount`, `created_at`, `expires_at`) VALUES
(101, '4', '1', 'CONFIRMED', 450000.00, '2026-11-01 08:30:00', '2026-11-01 08:40:00'),
(102, '4', '1', 'PENDING_PAYMENT', 300000.00, NOW(), DATE_ADD(NOW(), INTERVAL 10 MINUTE));

INSERT INTO `booking_items` (`id`, `booking_id`, `ticket_type_id`, `seat_id`, `quantity`, `unit_price`) VALUES
(1, 101, '1', 'A01', 1, 450000.00),
(2, 102, '2', 'C01', 1, 300000.00);

INSERT INTO `seat_reservations` (`id`, `event_id`, `seat_id`, `booking_id`, `status`) VALUES
(1, '1', 'A01', 101, 'SOLD'),
(2, '1', 'C01', 102, 'HELD');

INSERT INTO `ticket_inventory` (`id`, `event_id`, `ticket_type_id`, `total_quantity`, `held_quantity`, `sold_quantity`) VALUES
(1, '1', '1', 16, 0, 1),
(2, '1', '2', 14, 1, 0),
(3, '1', '3', 300, 0, 0),
(4, '1', '4', 200, 0, 0),
(5, '2', '5', 20, 0, 0),
(6, '2', '6', 10, 0, 0);


-- ==============================================================================
-- 5. TICKET / CHECK-IN SERVICE DATABASE
-- ==============================================================================
CREATE DATABASE IF NOT EXISTS `ticket_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `ticket_db`;

DROP TABLE IF EXISTS `checkin_logs`;
DROP TABLE IF EXISTS `tickets`;

CREATE TABLE `tickets` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `ticket_code` VARCHAR(64) NOT NULL,
    `booking_id` BIGINT UNSIGNED NOT NULL,
    `event_id` BIGINT UNSIGNED NOT NULL,
    `ticket_type_id` BIGINT UNSIGNED NOT NULL,
    `seat_code` VARCHAR(20) DEFAULT NULL,
    `attendee_name` VARCHAR(100) NOT NULL,
    `attendee_email` VARCHAR(191) NOT NULL,
    `qr_code_payload` TEXT NOT NULL,
    `is_checked_in` BOOLEAN NOT NULL DEFAULT FALSE,
    `checked_in_at` DATETIME DEFAULT NULL COMMENT 'Thời điểm soát vé vào cổng',
    `status` ENUM('VALID', 'CHECKED_IN', 'CANCELLED', 'REFUNDED') NOT NULL DEFAULT 'VALID',
    `issued_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời điểm phát hành vé sau khi thanh toán thành công',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_ticket_code` (`ticket_code`),
    KEY `idx_ticket_event_status` (`event_id`, `status`)
) ENGINE=InnoDB;

CREATE TABLE `checkin_logs` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `ticket_id` BIGINT UNSIGNED NOT NULL,
    `staff_user_id` BIGINT UNSIGNED NOT NULL,
    `checkin_device_info` VARCHAR(191) DEFAULT NULL,
    `gate_name` VARCHAR(50) DEFAULT 'Cổng A',
    `checkin_time` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    CONSTRAINT `fk_log_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`)
) ENGINE=InnoDB;


-- ==============================================================================
-- 6. NOTIFICATION SERVICE DATABASE
-- ==============================================================================
CREATE DATABASE IF NOT EXISTS `notification_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `notification_db`;

DROP TABLE IF EXISTS `notifications`;
DROP TABLE IF EXISTS `notification_templates`;

CREATE TABLE `notification_templates` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `template_code` VARCHAR(50) NOT NULL,
    `channel` ENUM('EMAIL', 'SMS', 'IN_APP') NOT NULL DEFAULT 'EMAIL',
    `subject_template` VARCHAR(255) NOT NULL,
    `body_template` LONGTEXT NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_template_code_channel` (`template_code`, `channel`)
) ENGINE=InnoDB;

CREATE TABLE `notifications` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `recipient_user_id` BIGINT UNSIGNED NOT NULL,
    `recipient_destination` VARCHAR(191) NOT NULL,
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
-- ==============================================================================
CREATE DATABASE IF NOT EXISTS `reporting_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `reporting_db`;

DROP TABLE IF EXISTS `settlement_reports`;
DROP TABLE IF EXISTS `daily_sales_stats`;
DROP TABLE IF EXISTS `event_sales_summaries`;

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

CREATE TABLE `daily_sales_stats` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `event_id` BIGINT UNSIGNED NOT NULL,
    `stat_date` DATE NOT NULL,
    `tickets_sold_count` INT UNSIGNED NOT NULL DEFAULT 0,
    `daily_revenue` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_event_daily_stat` (`event_id`, `stat_date`)
) ENGINE=InnoDB;

CREATE TABLE `settlement_reports` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `settlement_code` VARCHAR(50) NOT NULL,
    `event_id` BIGINT UNSIGNED NOT NULL,
    `organizer_id` BIGINT UNSIGNED NOT NULL,
    `gross_sales` DECIMAL(15, 2) NOT NULL,
    `platform_fee_percent` DECIMAL(5, 2) NOT NULL DEFAULT 5.00,
    `platform_fee_amount` DECIMAL(15, 2) NOT NULL,
    `payout_amount` DECIMAL(15, 2) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'TRANSFERRED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `settled_at` DATETIME DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_settle_event` (`event_id`)
) ENGINE=InnoDB;
