# Hướng dẫn triển khai QuickDrop v1.0 trên VPS
### (Docker + Docker Compose + Portainer CE + Nginx Proxy Manager + `npm_proxy_network`)

Tài liệu này hướng dẫn chi tiết từng bước để triển khai **QuickDrop** lên máy chủ VPS đã cài đặt sẵn môi trường:
- **Docker Engine & Docker Compose**
- **Portainer CE** (Giao diện quản lý container)
- **Nginx Proxy Manager (NPM)** (Reverse proxy tự động cấp chứng chỉ SSL Let's Encrypt)
- Docker Network: **`npm_proxy_network`** (Mạng cầu nối giữa NPM và các ứng dụng)

---

## 🏗️ 1. Kiến trúc mô hình triển khai

```
[ Người dùng Internet / Trình duyệt ]
                │  (HTTPS - Cổng 443 + WSS WebSocket)
                ▼
        [ VPS Firewall ]
                │
                ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  Nginx Proxy Manager Container (Port 80/443)                │
   │  - Quản lý SSL Let's Encrypt miễn phí                      │
   │  - Tự động chuyển hướng HTTP -> HTTPS                      │
   │  - Hỗ trợ WebSocket Upgrade (ws: -> wss:)                   │
   └──────────────┬──────────────────────────────────────────────┘
                  │  (Mạng Docker: npm_proxy_network)
                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  QuickDrop Container (Tên container: quickdrop-app)         │
   │  - Node.js 22 LTS + Express + Socket.IO                     │
   │  - Cổng nội bộ: 3000 (Không cần mở cổng này ra ngoài VPS)   │
   │  - Chỉ làm nhiệm vụ Signaling WebRTC                        │
   │  - Lưu trữ RAM, 0% dung lượng đĩa ghi file                 │
   └─────────────────────────────────────────────────────────────┘
                  │
                  ▼ (Sau khi bắt tay qua WebRTC)
[ Trình duyệt A ] ◄══════ WebRTC DataChannel ══════► [ Trình duyệt B ]
             (Dữ liệu file truyền thẳng P2P, KHÔNG qua VPS)
```

> **Lợi ích bảo mật:** Container `quickdrop-app` chỉ giao tiếp qua mạng nội bộ `npm_proxy_network`. Bạn **không cần mở cổng 3000 trên Firewall VPS**, giúp ngăn chặn hoàn toàn việc quét cổng từ bên ngoài.

---

## 📌 2. Chuẩn bị trước khi cài đặt

1. **Trỏ tên miền (DNS):**
   - Đăng nhập nhà cung cấp tên miền (Cloudflare, Namecheap, v.v.).
   - Tạo bản ghi **A Record**:
     - **Host / Name**: `drop` (hoặc `quickdrop`, `share`)
     - **Value / IP Address**: `Địa chỉ IPv4 của VPS`
     - Ví dụ: `drop.yourdomain.com` -> `123.45.67.89`
2. **Xác nhận mạng `npm_proxy_network` đã tồn tại:**
   - Kiểm tra bằng lệnh:
     ```bash
     docker network ls | grep npm_proxy_network
     ```
   - Nếu chưa có, tạo bằng lệnh:
     ```bash
     docker network create npm_proxy_network
     ```

---

## 🚀 3. Cách 1: Cài đặt qua giao diện Portainer CE (Khuyên dùng)

Nếu bạn quản lý VPS thông qua giao diện Web của **Portainer CE**, thực hiện các bước sau:

### Bước 3.1: Tạo Stack mới
1. Đăng nhập vào **Portainer CE**.
2. Chọn môi trường làm việc của bạn (thường là **local** hoặc **primary**).
3. Ở menu bên trái, nhấp vào mục **Stacks** ➜ Nhấp nút **Add stack**.

### Bước 3.2: Đặt tên và dán cấu hình Stack
1. **Name**: `quickdrop`
2. **Build method**: Chọn **Web editor**.
3. Dán toàn bộ nội dung sau vào khung soạn thảo:

```yaml
version: '3.8'

services:
  quickdrop:
    image: node:22-alpine
    container_name: quickdrop-app
    restart: unless-stopped
    working_dir: /app
    environment:
      - NODE_ENV=production
      - PORT=3000
      - ROOM_TIMEOUT_MS=600000
      - CHUNK_SIZE=65536
      - RATE_LIMIT_MAX=100
      - CORS_ORIGIN=*
    networks:
      - npm_proxy_network
    expose:
      - "3000"
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

networks:
  npm_proxy_network:
    external: true
```

---

## 💻 4. Cách 2: Cài đặt qua dòng lệnh SSH (Terminal)

Nếu bạn thao tác qua SSH Terminal trên VPS:

```bash
# 1. Di chuyển vào thư mục chứa các ứng dụng Docker
cd /home/docker  # hoặc thư mục tùy bạn chọn

# 2. Clone hoặc tải mã nguồn QuickDrop
git clone https://github.com/your-username/quickdrop.git
cd quickdrop

# 3. Tạo file cấu hình môi trường .env (nếu cần tùy chỉnh)
cp .env.example .env

# 4. Khởi chạy container với file cấu hình dành riêng cho Nginx Proxy Manager
docker compose -f docker/docker-compose.npm.yml up -d --build

# 5. Kiểm tra trạng thái container
docker ps | grep quickdrop-app

# 6. Xem log chạy
docker logs -f quickdrop-app
```

Khi thấy dòng chữ:
```
  🚀 QuickDrop v1.0 - In-Browser P2P File Transfer
  • Server running at: http://localhost:3000
```
nghĩa là ứng dụng đã khởi chạy thành công trong mạng `npm_proxy_network`!

---

## 🌐 5. Cấu hình Nginx Proxy Manager (Cấp SSL & WebSocket)

> ⚠️ **BẮT BUỘC:** WebRTC và Crypto API yêu cầu kết nối an toàn **HTTPS**. Không có HTTPS, trình duyệt sẽ chặn kết nối P2P.

### Bước 5.1: Mở giao diện Nginx Proxy Manager
- Truy cập vào trang quản trị NPM (thường là `http://IP_VPS:81`).
- Vào menu **Hosts** ➜ Chọn **Proxy Hosts** ➜ Nhấp **Add Proxy Host**.

### Bước 5.2: Cấu hình Tab "Details"
Điền chính xác các thông số sau:
- **Domain Names**: Điền tên miền bạn đã trỏ (ví dụ: `drop.yourdomain.com`).
- **Scheme**: `http`
- **Forward Hostname / IP**: `quickdrop-app` *(Đây chính là tên container trong mạng `npm_proxy_network`)*
- **Forward Port**: `3000`
- ✅ **Cache Assets**: Bật (tùy chọn)
- ✅ **Block Common Exploits**: Bật
- ✅ **Websockets Support**: **BẮT BUỘC BẬT!** *(Nếu tắt, Socket.IO không thể bắt tay kết nối)*

---

### Bước 5.3: Cấu hình Tab "SSL"
Chuyển sang tab **SSL**:
- **SSL Certificate**: Chọn **Request a new SSL Certificate**.
- ✅ **Force SSL**: Bật (tự động chuyển hướng từ `http://` sang `https://`).
- ✅ **HTTP/2 Support**: Bật (tăng tốc độ tải trang).
- ✅ **HSTS Enabled**: Bật (tùy chọn).
- **Email Address for Let's Encrypt**: Nhập email nhận thông báo hạn chứng chỉ của bạn.
- ✅ **I Agree to the Let's Encrypt Terms of Service**: Tích chọn.

---

### Bước 5.4: Cấu hình Tab "Advanced" (Tối ưu kết nối duy trì)
Để đảm bảo các kết nối truyền file dung lượng lớn hoặc thời gian chờ không bị ngắt timeout bởi Nginx:
Chuyển sang tab **Advanced**, dán đoạn cấu hình Nginx sau:

```nginx
# Tối ưu kết nối thời gian thực WebSocket cho QuickDrop
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";

# Tăng thời gian chờ tránh ngắt kết nối khi đang truyền file lớn
proxy_connect_timeout 86400s;
proxy_send_timeout 86400s;
proxy_read_timeout 86400s;

# Vô hiệu hóa bộ đệm trung gian để dữ liệu truyền tức thì
proxy_buffering off;
```

Nhấp **Save** để hoàn tất.

---

## ✅ 6. Kiểm tra và sử dụng

1. Mở trình duyệt trên máy tính: `https://drop.yourdomain.com`
2. Kiểm tra biểu tượng ổ khóa SSL màu xanh đã được kích hoạt.
3. Ở góc phải thanh tiêu đề: Hiển thị chấm xanh và dòng chữ **"Sẵn sàng kết nối"**.
4. **Thử nghiệm truyền file:**
   - Thiết bị 1 (Gửi): Nhấp **Tạo kết nối mới**, màn hình hiện mã 6 chữ số và mã QR.
   - Thiết bị 2 (Nhận - ví dụ điện thoại): Mở camera quét mã QR ➜ Thiết bị tự động vào trang và nhập mã ➜ Nhấn kết nối.
   - Khi hai bên hiện **"Đã kết nối WebRTC"**, chọn file và bắt đầu truyền!

---

## 🔧 7. Xử lý sự cố thường gặp (Troubleshooting)

### 1. Lỗi `502 Bad Gateway`
- **Nguyên nhân**: Nginx Proxy Manager không tìm thấy container `quickdrop-app`.
- **Cách khắc phục**:
  1. Kiểm tra xem container `quickdrop-app` đã gia nhập vào đúng mạng `npm_proxy_network` chưa:
     ```bash
     docker network inspect npm_proxy_network
     ```
     Trong danh sách `Containers`, phải nhìn thấy `quickdrop-app`.
  2. Trong trường `Forward Hostname / IP` trên NPM, hãy nhập đúng `quickdrop-app` (hoặc `quickdrop`), không nhập `localhost` hay `127.0.0.1` vì mỗi container có localhost riêng.

### 2. Trạng thái hiển thị "Mất kết nối tín hiệu" hoặc mã không sinh ra
- **Nguyên nhân**: Chưa bật tính năng WebSocket trên Nginx Proxy Manager.
- **Cách khắc phục**: Vào lại Proxy Host trong NPM ➜ Tab Details ➜ Gạt bật công tắc **Websockets Support** ➜ Nhấn Save.

### 3. Hai thiết bị khác mạng (Wifi khác nhau hoặc 4G) không truyền được file
- **Nguyên nhân**: Mạng di động 4G/5G hoặc mạng doanh nghiệp có firewall loại Symmetric NAT chặn kết nối STUN mặc định của Google.
- **Cách khắc phục**: Bổ sung tài khoản TURN Server vào biến môi trường trong file `.env`:
  ```bash
  TURN_SERVER_URL="turn:your-turn-server.com:3478"
  TURN_USERNAME="your-username"
  TURN_CREDENTIAL="your-password"
  ```
