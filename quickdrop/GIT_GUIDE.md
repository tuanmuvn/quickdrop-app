# Hướng dẫn đẩy mã nguồn QuickDrop lên Git & Tự động Deploy Portainer CE

Tài liệu này hướng dẫn chi tiết từ lúc khởi tạo kho lưu trữ (Git repository), đẩy code lên GitHub/GitLab, cho đến việc thiết lập **tự động cập nhật (Webhook)** trên Portainer CE trên VPS.

---

## 📁 1. Kiểm tra cấu trúc thư mục trước khi đẩy code

Đảm bảo thư mục dự án của bạn có cấu trúc chuẩn như sau:

```
quickdrop/
├── server/                  # Backend Express & Socket.IO Signaling
│   ├── app.js
│   ├── socket.js
│   ├── roomManager.js
│   ├── config.js
│   └── package.json         # Package sạch chỉ chứa 7 dependencies backend
├── public/                  # Frontend HTML5, CSS3, ES Module JavaScript
│   ├── index.html           # Windows 11 Fluent Design Dark Mode UI
│   ├── css/style.css
│   ├── js/
│   │   ├── main.js
│   │   ├── ui.js
│   │   ├── socket.js
│   │   ├── rtc.js
│   │   └── transfer.js
│   └── assets/favicon.svg
├── docker/
│   ├── Dockerfile           # Dockerfile Node 22 Alpine đã sửa lỗi ERESOLVE
│   ├── docker-compose.yml   # Chạy độc lập
│   └── docker-compose.npm.yml # Chạy qua Nginx Proxy Manager (npm_proxy_network)
├── .env.example             # Mẫu cấu hình môi trường
├── .gitignore               # Đã loại trừ node_modules, .env
├── package.json             # Root package
├── README.md                # Tài liệu tổng quan
├── DEPLOY_VPS.md            # Tài liệu triển khai VPS chi tiết
└── GIT_GUIDE.md             # File hướng dẫn này
```

---

## 🐙 2. Đẩy mã nguồn lên GitHub (Lần đầu tiên)

### Bước 2.1: Tạo Repository trống trên GitHub
1. Truy cập [github.com/new](https://github.com/new).
2. **Repository name**: `quickdrop` (hoặc tên tùy bạn chọn).
3. Chọn chế độ: **Public** hoặc **Private**.
4. **LƯU Ý:** **Không** tích chọn *"Add a README file"*, *"Add .gitignore"* vì dự án đã có sẵn các file này.
5. Nhấp nút **Create repository**.
6. Sao chép đường dẫn repository, ví dụ:
   - Dạng HTTPS: `https://github.com/<tai-khoan-cua-ban>/quickdrop.git`

---

### Bước 2.2: Chạy các lệnh Git trên máy của bạn
Mở Terminal tại thư mục gốc của dự án `quickdrop` và thực thi lần lượt:

```bash
# 1. Khởi tạo kho Git cục bộ (nếu chưa khởi tạo)
git init

# 2. Kiểm tra các file sẽ được thêm vào
git status

# 3. Thêm toàn bộ file vào khu vực chờ commit
git add .

# 4. Tạo commit đầu tiên
git commit -m "feat: QuickDrop v1.0 - In-browser WebRTC P2P file transfer production-ready"

# 5. Đổi tên nhánh chính thành main
git branch -M main

# 6. Liên kết với kho lưu trữ trên GitHub (thay URL của bạn vào)
git remote add origin https://github.com/<tai-khoan-cua-ban>/quickdrop.git

# 7. Đẩy toàn bộ mã nguồn lên GitHub
git push -u origin main
```

---

## 🔄 3. Cách cập nhật code những lần tiếp theo

Mỗi khi bạn sửa đổi hoặc thêm tính năng mới, chỉ cần chạy 3 lệnh sau để đẩy lên GitHub:

```bash
# 1. Lưu các thay đổi
git add .

# 2. Tạo commit mô tả nội dung vừa cập nhật
git commit -m "fix: tối ưu giao diện và cập nhật cấu hình Dockerfile"

# 3. Đẩy lên nhánh main
git push
```

---

## 🚀 4. Triển khai từ GitHub vào Portainer CE trên VPS

Sau khi code đã nằm trên GitHub, việc triển khai trên Portainer CE trở nên cực kỳ đơn giản và không bao giờ gặp lỗi thiếu file:

### Bước 4.1: Tạo Stack dạng Repository trên Portainer CE
1. Đăng nhập vào **Portainer CE** trên VPS.
2. Menu trái chọn **Stacks** ➜ Nhấp **Add stack**.
3. **Name**: `quickdrop`
4. Tại mục **Build method**, chọn tab **Repository**:
   - **Repository URL**: `https://github.com/<tai-khoan-cua-ban>/quickdrop.git`
   - **Repository reference**: `refs/heads/main`
   - **Compose path**: `docker/docker-compose.npm.yml`
5. *(Tùy chọn nếu repository là Private)*: Bật mục **Authentication** và nhập `Username` cùng `Personal Access Token (PAT)` của GitHub.

---

### Bước 4.2: Bật tính năng Tự động Cập nhật (Auto-Update)
Trong trang cấu hình Stack trên Portainer:
1. Tìm mục **Automatic updates**: Gạt sang **Enabled**.
2. Chọn cơ chế:
   - **Polling**: Portainer sẽ kiểm tra định kỳ (ví dụ mỗi 5 phút). Nếu có commit mới trên GitHub, nó sẽ tự động `git pull` và build lại container.
   - **Webhook**: Portainer sinh ra một đường dẫn URL Webhook. Bạn chỉ cần dán URL này vào **GitHub Settings ➜ Webhooks**, mỗi khi bạn `git push` thì GitHub sẽ báo cho Portainer tự rebuild tức thì!
3. Nhấp nút **Deploy the stack**.

---

## 🌐 5. Cấu hình Nginx Proxy Manager (Nhắc lại)

Khi container `quickdrop-app` đã hiển thị trạng thái `Healthy` trong Portainer:

1. Vào Nginx Proxy Manager (cổng 81) ➜ **Add Proxy Host**:
   - **Domain Names**: `drop.yourdomain.com`
   - **Scheme**: `http`
   - **Forward Hostname / IP**: `quickdrop-app`
   - **Forward Port**: `3000`
   - ✅ **Websockets Support** (BẮT BUỘC BẬT)
   - ✅ **Block Common Exploits**
2. Tab **SSL**:
   - Chọn **Request a new SSL Certificate** (Let's Encrypt)
   - ✅ **Force SSL**
   - ✅ **HTTP/2 Support**
3. Nhấp **Save**.

Mở trình duyệt truy cập `https://drop.yourdomain.com` để trải nghiệm truyền file trực tiếp P2P!
