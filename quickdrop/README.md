# QuickDrop v1.0 ⚡

> **Ứng dụng truyền file ngang hàng (P2P) trực tiếp giữa hai trình duyệt qua WebRTC & Socket.IO.**  
> *Hoạt động tương tự Apple AirDrop nhưng chạy 100% trên nền tảng web đa nền tảng (Windows, macOS, Linux, Android, iOS).*

---

## 📋 Mục lục
1. [Giới thiệu](#-giới-thiệu)
2. [Tính năng nổi bật](#-tính-năng-nổi-bật)
3. [Kiến trúc hệ thống](#-kiến-trúc-hệ-thống)
4. [Nguyên lý hoạt động](#-nguyên-lý-hoạt-động)
5. [Tech Stack](#-tech-stack)
6. [Cấu trúc thư mục](#-cấu-trúc-thư-mục)
7. [Cài đặt & Chạy trực tiếp (Local)](#-cài-đặt--chạy-trực-tiếp-local)
8. [Hướng dẫn đẩy code lên Git & Auto-Deploy Portainer](GIT_GUIDE.md) 🐙
9. [Triển khai trên VPS (Portainer & Nginx Proxy Manager)](DEPLOY_VPS.md) ⚡
10. [Cấu hình Production & Nginx Proxy Manager (HTTPS)](#-cấu-hình-production--nginx-proxy-manager-https)
11. [Xử lý sự cố (Troubleshooting)](#-xử-lý-sự-cố-troubleshooting)
12. [Roadmap](#-roadmap)
13. [Giấy phép](#-giấy-phép)

---

## 🚀 Giới thiệu

**QuickDrop** là giải pháp truyền file không dây tốc độ cao, không phụ thuộc vào hệ sinh thái của bất kỳ hãng phần cứng nào. Bạn có thể truyền file từ iPhone sang máy tính bảng Android, từ laptop Windows sang Macbook một cách tức thì chỉ bằng việc mở trình duyệt web.

**Quy tắc bất biến về quyền riêng tư & bảo mật:**
- 🛡️ **Zero-Storage:** Máy chủ **KHÔNG BAO GIỜ** lưu hay đọc file. Máy chủ chỉ đóng vai trò làm trạm điều phối tín hiệu (**Signaling**).
- ⚡ **Direct WebRTC DataChannel:** File truyền theo đường hầm ngang hàng trực tiếp giữa 2 trình duyệt.
- 🧹 **Tự động hủy:** Sau khi hoàn tất truyền file hoặc sau 10 phút, phòng kết nối trong bộ nhớ RAM tự động bị xóa sổ hoàn toàn.

---

## ✨ Tính năng nổi bật

- 🔑 **Mã kết nối 6 chữ số ngẫu nhiên:** Sinh mã phòng tức thì (ví dụ: `483921`), thuật toán chống trùng lặp.
- 📱 **Tự động sinh QR Code:** Thiết bị di động chỉ cần quét camera để tự động vào phòng nhận file (`/?room=483921`).
- ⏳ **Bộ đếm thời gian 10:00:** Phòng tự động hết hạn và xóa sau 10 phút để tiết kiệm tài nguyên.
- 📦 **Cơ chế Chunk 64KB & Backpressure:** Sử dụng `File.slice()` đọc từng mảnh 64KB, không tải toàn bộ file vào RAM, chống tràn bộ nhớ trình duyệt ngay cả với file hàng chục Gigabyte.
- 📊 **Bảng theo dõi thời gian thực:**
  - Phần trăm hoàn thành (%)
  - Tốc độ truyền tải tính bằng **MB/s** (cập nhật mỗi giây)
  - Ước lượng thời gian còn lại (**ETA**: ví dụ *12 giây*, *1 phút 20 giây*)
  - Dung lượng đã truyền / Tổng dung lượng
- 📂 **Hỗ trợ đa dạng:** Truyền 1 file, nhiều file cùng lúc hoặc nguyên cả **Thư mục (Folder)**.
- 🛡️ **Xác nhận 2 chiều (Accept / Reject):** Người nhận xem trước tên file, kích thước và có quyền Chấp nhận hoặc Từ chối trước khi truyền dữ liệu.
- 🎨 **Giao diện Windows 11 Fluent Design:** Dark mode chuẩn (`#111827`, `#1E293B`, `#2563EB`), hiệu ứng kính mờ Acrylic/Glassmorphism, bo góc mềm mại, hiển thị hoàn hảo trên Desktop, Tablet và Mobile.

---

## 🏛️ Kiến trúc hệ thống

### 1. Giai đoạn Ghép đôi & Trao đổi tín hiệu (Signaling via Socket.IO)
```
  [ Trình duyệt A (Sender) ]                  [ Trình duyệt B (Receiver) ]
              │                                            │
              ├────── 1. create-room (6 số) ──────►        │
              │       ◄── room-created (483921) ─┤        │
              │                                            │
              │        ◄──── 2. join-room (483921) ────────┤
              │◄───── 3. receiver-joined ──────────────────┤
              │                                            │
              ├────── 4. WebRTC Offer (SDP) ──────────────►│ (qua Server)
              │◄───── 5. WebRTC Answer (SDP) ──────────────┤ (qua Server)
              ├◄────► 6. Trao đổi ICE Candidates ─────────►│ (qua Server)
```

### 2. Giai đoạn Truyền dữ liệu (P2P DataChannel - Server hoàn toàn đứng ngoài)
```
  [ Trình duyệt A (Sender) ]                  [ Trình duyệt B (Receiver) ]
              │                                            │
              ├══════ Kênh WebRTC RTCDataChannel MỞ ═══════┤
              │                                            │
              ├────── Gửi Header (Tên, Kích thước) ───────►│
              │◄───── Phản hồi Accept ─────────────────────┤
              │                                            │
              ├─── Stream Chunks 64KB (File.slice) ───────►│
              ├─── [Chunk 1, Chunk 2, ..., Chunk N] ──────►│
              │                                            │
              ├────── file-end / all-complete ────────────►│
              │                                            │
              │                     Tạo Blob & URL.createObjectURL()
              │                     Lưu file vào ổ đĩa nội bộ
              │                                            │
              └────── Báo Server XÓA PHÒNG NGAY LẬP TỨC ───┘
```

---

## 🛠️ Tech Stack

- **Backend:**
  - Node.js 22 LTS
  - Express.js (Phục vụ Static files & REST Healthcheck)
  - Socket.IO (Signaling WebRTC)
  - Helmet (Bảo mật HTTP Headers & CSP)
  - Compression (Nén Gzip/Brotli)
  - Express-Rate-Limit (Giới hạn 100 req/phút/IP)
  - In-Memory RAM Storage (Không Database)
- **Frontend:**
  - HTML5 & CSS3
  - Bootstrap 5 & FontAwesome 6
  - Vanilla JavaScript (ES Modules, Không framework nặng)
  - WebRTC DataChannel API
  - QRCode.js
- **DevOps:**
  - Docker (Multi-stage Alpine Linux)
  - Docker Compose

---

## 📁 Cấu trúc thư mục

```
quickdrop/
├── server/
│   ├── app.js               # Entry point Express HTTP & Socket.IO server
│   ├── socket.js            # Signaling event handlers (room, offer, answer, ice)
│   ├── roomManager.js       # Quản lý phòng 6 số trong RAM & tự hủy 10 phút
│   ├── config.js            # Cấu hình biến môi trường, STUN/TURN, timeout
│   └── package.json         # Dependencies backend
├── public/
│   ├── index.html           # Giao diện chính Fluent Design
│   ├── css/
│   │   └── style.css        # Windows 11 Dark Mode & Glassmorphism styles
│   ├── js/
│   │   ├── main.js          # Bootstrap & điều phối toàn bộ ứng dụng
│   │   ├── ui.js            # Quản lý DOM, view state, toast, countdown
│   │   ├── socket.js        # Socket.IO client signaling wrapper
│   │   ├── rtc.js           # WebRTC RTCPeerConnection & DataChannel wrapper
│   │   └── transfer.js      # Bộ truyền file 64KB chunks & tính tốc độ/ETA
│   └── assets/
│       └── favicon.svg      # Logo biểu tượng QuickDrop
├── docker/
│   ├── Dockerfile           # Dockerfile Node 22 Alpine tối ưu
│   ├── docker-compose.yml   # Docker Compose chuẩn
│   └── docker-compose.npm.yml # Docker Compose cho Nginx Proxy Manager
├── .env.example             # Mẫu cấu hình môi trường
├── .gitignore               # Loại bỏ node_modules, .env
├── README.md                # Tài liệu tổng quan
├── DEPLOY_VPS.md            # Tài liệu triển khai VPS chi tiết
└── GIT_GUIDE.md             # Hướng dẫn đẩy Git & Auto-Deploy Portainer
```

---

## 💻 Cài đặt & Chạy trực tiếp (Local)

### Yêu cầu tiên quyết:
- Đã cài đặt **Node.js 22 LTS** hoặc mới hơn.
- Trình duyệt hiện đại hỗ trợ WebRTC (Chrome, Edge, Firefox, Safari, Brave).

### Các bước thực hiện:
```bash
# 1. Clone repository
git clone https://github.com/your-username/quickdrop.git
cd quickdrop

# 2. Cài đặt thư viện
npm install

# 3. Tạo file môi trường từ template
cp .env.example .env

# 4. Khởi chạy ứng dụng
npm run start
# hoặc chế độ dev với auto-reload:
npm run dev
```

Mở trình duyệt tại địa chỉ: `http://localhost:3000`

---

## 📄 Giấy phép

Phát hành dưới giấy phép **MIT License**. Tự do sử dụng, chỉnh sửa và triển khai thương mại mà không có bất kỳ ràng buộc nào.
