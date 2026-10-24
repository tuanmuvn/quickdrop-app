# Hướng dẫn triển khai QuickDrop v1.0 trên VPS (Cổng 8055)
### (Docker + Docker Compose + Portainer CE + Nginx Proxy Manager + `npm_proxy_network`)

Tài liệu này hướng dẫn chi tiết từng bước để triển khai **QuickDrop** hoạt động trên cổng **8055** lên VPS đã có sẵn môi trường:
- **Docker Engine & Docker Compose**
- **Portainer CE** (Quản lý container)
- **Nginx Proxy Manager (NPM)** (Reverse proxy + SSL Let's Encrypt)
- Docker Network: **`npm_proxy_network`**

---

## 🏗️ 1. Kiến trúc mô hình mạng

```
[ Trình duyệt Người Dùng ]
           │  (HTTPS Cổng 443 + WSS WebSocket)
           ▼
   [ VPS Firewall ] (Chỉ cần mở cổng 80 & 443)
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│  Nginx Proxy Manager Container (Port 80/443)                │
│  - Cấp SSL Let's Encrypt tự động                           │
│  - Chuyển tiếp WebSocket (ws: -> wss:)                      │
└──────────────┬──────────────────────────────────────────────┘
               │  (Mạng nội bộ: npm_proxy_network)
               ▼
┌─────────────────────────────────────────────────────────────┐
│  QuickDrop Container (Tên container: quickdrop-app)         │
│  - Cổng dịch vụ: 8055                                       │
│  - Chỉ làm nhiệm vụ Signaling WebRTC                        │
│  - Lưu trữ RAM in-memory, 0% đĩa lưu file                   │
└─────────────────────────────────────────────────────────────┘
               │
               ▼ (Sau khi bắt tay qua WebRTC)
[ Trình duyệt A ] ◄══════ WebRTC DataChannel ══════► [ Trình duyệt B ]
             (Truyền file trực tiếp P2P, KHÔNG qua VPS)
```

---

## 📌 2. Chuẩn bị trước khi cài đặt

1. **Trỏ tên miền (DNS):**
   - Tạo bản ghi **A Record**:
     - **Host / Name**: `drop` (hoặc tên miền phụ bạn muốn)
     - **Value / IP Address**: `Địa chỉ IPv4 của VPS`
     - Ví dụ: `drop.yourdomain.com` -> `IP_VPS`
2. **Kiểm tra mạng `npm_proxy_network`:**
   ```bash
   docker network ls | grep npm_proxy_network
   ```
   *(Nếu chưa có, tạo lệnh: `docker network create npm_proxy_network`)*

---

## 🚀 3. Cách 1: Triển khai từ GitHub vào Portainer CE (Khuyên dùng)

Đây là cách chuẩn nhất khi bạn đã đẩy mã nguồn lên GitHub:

### Bước 3.1: Tạo Stack trong Portainer CE
1. Đăng nhập vào **Portainer CE**.
2. Chọn môi trường làm việc (**local** hoặc **primary**).
3. Menu bên trái ➜ **Stacks** ➜ Nhấp **Add stack**.
4. **Name**: `quickdrop`
5. Chọn tab **Repository**:
   - **Repository URL**: `https://github.com/<tai-khoan-cua-ban>/quickdrop.git`
   - **Repository reference**: `refs/heads/main`
   - **Compose path**: `docker-compose.npm.yml` *(hoặc `docker/docker-compose.npm.yml`)*
6. Bật mục **Automatic updates** (chọn Polling hoặc Webhook) để tự động cập nhật mỗi khi push code mới.
7. Nhấp **Deploy the stack**.

---

## 💻 4. Cách 2: Triển khai trực tiếp qua SSH Terminal trên VPS

Nếu bạn thích thao tác bằng dòng lệnh trên VPS:

```bash
# 1. Di chuyển vào thư mục docker
cd /home/docker  # hoặc thư mục tùy bạn

# 2. Clone mã nguồn
git clone https://github.com/<tai-khoan-cua-ban>/quickdrop.git
cd quickdrop

# 3. Tạo file môi trường từ template (đã đặt sẵn PORT=8055)
cp .env.example .env

# 4. Khởi chạy container trên mạng npm_proxy_network
docker compose -f docker-compose.npm.yml up -d --build

# 5. Kiểm tra log
docker logs -f quickdrop-app
```

Khi thấy dòng log:
```
  🚀 QuickDrop v1.0 - In-Browser P2P File Transfer
  • Server running at: http://localhost:8055
```
nghĩa là ứng dụng đã chạy thành công trên cổng 8055!

---

## 🌐 5. Cấu hình Nginx Proxy Manager (Cấp SSL & Port 8055)

> ⚠️ **LƯU Ý:** Trình duyệt **bắt buộc phải có HTTPS** để cấp quyền chạy API WebRTC DataChannel.

### Bước 5.1: Thêm Proxy Host
Vào Nginx Proxy Manager (cổng 81) ➜ **Hosts** ➜ **Proxy Hosts** ➜ **Add Proxy Host**:

#### Tab "Details":
- **Domain Names**: `drop.yourdomain.com` *(tên miền của bạn)*
- **Scheme**: `http`
- **Forward Hostname / IP**: `quickdrop-app` *(tên container trong Docker)*
- **Forward Port**: `8055`
- ✅ **Cache Assets**: Bật
- ✅ **Block Common Exploits**: Bật
- ✅ **Websockets Support**: **BẮT BUỘC BẬT!** *(Để Socket.IO bắt tay signaling)*

#### Tab "SSL":
- **SSL Certificate**: **Request a new SSL Certificate**
- ✅ **Force SSL**: Bật
- ✅ **HTTP/2 Support**: Bật
- **Email**: Nhập email của bạn
- ✅ **I Agree to the Let's Encrypt Terms of Service**: Tích chọn

#### Tab "Advanced" (Tối ưu kết nối không bị ngắt timeout):
Dán đoạn cấu hình Nginx sau vào khung:

```nginx
# Hỗ trợ WebSocket thời gian thực cho QuickDrop
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";

# Tăng timeout tránh ngắt kết nối khi đang truyền file lớn
proxy_connect_timeout 86400s;
proxy_send_timeout 86400s;
proxy_read_timeout 86400s;

# Vô hiệu hóa buffering trung gian
proxy_buffering off;
```

Nhấp **Save** để hoàn tất.

---

## 🔍 6. Xử lý sự cố (Troubleshooting)

### 1. Lỗi `502 Bad Gateway`
- Kiểm tra container `quickdrop-app` đã gia nhập mạng `npm_proxy_network` chưa:
  ```bash
  docker network inspect npm_proxy_network
  ```
- Kiểm tra `Forward Port` trong Nginx Proxy Manager đã đặt đúng **`8055`** chưa.

### 2. Trạng thái chấm đỏ / Không sinh được mã 6 số
- Bạn quên chưa bật công tắc **Websockets Support** trong Nginx Proxy Manager. Vào lại tab Details và bật lên.

### 3. Kiểm tra trực tiếp container trên VPS
```bash
# Test endpoint healthcheck nội bộ
docker exec -it quickdrop-app wget -qO- http://localhost:8055/api/health
```
Kết quả trả về `{"status":"ok","app":"QuickDrop",...}` là container hoàn toàn bình thường.
