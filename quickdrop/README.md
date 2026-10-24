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
8. [Triển khai với Docker & Docker Compose](#-triển-khai-với-docker--docker-compose)
9. [Cấu hình Production & Nginx Proxy Manager (HTTPS)](#-cấu-hình-production--nginx-proxy-manager-https)
10. [Xử lý sự cố (Troubleshooting)](#-xử-lý-sự-cố-troubleshooting)
11. [Roadmap](#-roadmap)
12. [Giấy phép](#-giấy-phép)

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
│   └── docker-compose.yml   # Docker Compose triển khai sản xuất
├── .env.example             # Mẫu cấu hình môi trường
└── README.md                # Tài liệu hướng dẫn chi tiết
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

## 🐳 Triển khai với Docker & Docker Compose

### Cách 1: Sử dụng Docker Compose (Khuyên dùng)
```bash
# Khởi động dịch vụ ở chế độ background
docker compose -f docker/docker-compose.yml up -d --build

# Kiểm tra log ứng dụng
docker compose -f docker/docker-compose.yml logs -f

# Dừng dịch vụ
docker compose -f docker/docker-compose.yml down
```

### Cách 2: Sử dụng Docker CLI thuần
```bash
# Build image
docker build -t quickdrop:1.0 -f docker/Dockerfile .

# Chạy container
docker run -d \
  --name quickdrop \
  --restart unless-stopped \
  -p 3000:3000 \
  quickdrop:1.0
```

Kiểm tra trạng thái container bằng endpoint healthcheck:
```bash
curl http://localhost:3000/api/health
```

---

## 🌐 Cấu hình Production & Nginx Proxy Manager (HTTPS)

> ⚠️ **LƯU Ý QUAN TRỌNG:** Trình duyệt **bắt buộc phải có kết nối HTTPS (hoặc localhost)** để cấp quyền sử dụng các API bảo mật của WebRTC và Crypto. Khi triển khai ra ngoài internet, bạn cần cấu hình domain có chứng chỉ SSL.

### 1. Cấu hình Nginx thuần (`/etc/nginx/conf.d/quickdrop.conf`)
```nginx
server {
    listen 80;
    server_name drop.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name drop.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/drop.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/drop.yourdomain.com/privkey.pem;

    # Cấu hình proxy đến QuickDrop
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # WebSocket Upgrade bắt buộc cho Socket.IO
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Tăng timeout cho kết nối lâu dài
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

### 2. Cấu hình qua Nginx Proxy Manager (UI)
1. Thêm **Proxy Host**:
   - **Domain Names:** `drop.yourdomain.com`
   - **Forward Hostname / IP:** `127.0.0.1` hoặc tên service container `quickdrop`
   - **Forward Port:** `3000`
2. Bật các tùy chọn:
   - ✅ **Block Common Exploits**
   - ✅ **Websockets Support** (Bắt buộc!)
3. Tab **SSL**:
   - Chọn **Request a new SSL Certificate** (Let's Encrypt)
   - ✅ **Force SSL**
   - ✅ **HTTP/2 Support**

---

## 🔍 Xử lý sự cố (Troubleshooting)

### 1. Không kết nối được WebRTC giữa 2 thiết bị khác mạng (Ví dụ: 4G sang Wifi công ty)
- **Nguyên nhân:** Mạng công ty hoặc nhà mạng di động sử dụng Symmetric NAT chặn kết nối P2P trực tiếp qua STUN Google.
- **Giải pháp:** Cấu hình thêm TURN server trong `.env`:
  ```bash
  TURN_SERVER_URL="turn:your-turn-server.com:3478"
  TURN_USERNAME="user"
  TURN_CREDENTIAL="password"
  ```
  *(Có thể sử dụng coturn mã nguồn mở hoặc dịch vụ như Xirsys / Cloudflare Calls).*

### 2. Lỗi "WebSocket connection failed"
- Kiểm tra xem reverse proxy của bạn đã cấu hình header `Upgrade $http_upgrade` và `Connection "upgrade"` chưa.
- Kiểm tra Firewall trên máy chủ có mở port 80/443 (hoặc 3000) không.

### 3. File quá lớn gây đơ trình duyệt?
- QuickDrop đã giải quyết triệt để vấn đề này nhờ cơ chế **Backpressure** trong `transfer.js`. Khi `bufferedAmount > 512KB`, ứng dụng sẽ tạm dừng đọc chunk tiếp theo và chỉ đọc tiếp khi nhận sự kiện `bufferedamountlow`.

---

## 🗺️ Roadmap

- [x] WebRTC DataChannel 64KB chunking
- [x] Giao diện Windows 11 Fluent Dark Mode
- [x] Sinh QR Code tự động kết nối qua URL
- [x] Hỗ trợ truyền nhiều file và cả folder
- [x] Bộ đếm 10 phút tự hủy phòng trong RAM
- [ ] Mã hóa đầu cuối bổ sung (End-to-End Encryption) bằng WebCrypto AES-GCM
- [ ] Nén ZIP trực tiếp trên luồng gửi (Stream-based ZIP)
- [ ] Truyền file 1-nhiều (Multicast P2P Room)

---

## 📄 Giấy phép

Phát hành dưới giấy phép **MIT License**. Tự do sử dụng, chỉnh sửa và triển khai thương mại mà không có bất kỳ ràng buộc nào.
