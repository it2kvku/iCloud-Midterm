# Quản lý Sách — Điện toán đám mây

Tran Van Lam · **23IT139** · database **DB_23IT139** · tiền tố **139** · VAT **14%**.

## Chạy local

Yêu cầu Node.js 24 và MongoDB Atlas đã cấu hình theo phần tiếp theo.

```powershell
npm ci
Copy-Item .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Điền ba URI vào `.env`, dán chuỗi vừa sinh vào `SESSION_SECRET`. Không gửi URI vào chat, không chụp mật khẩu và không commit `.env`. Mật khẩu trong URI phải được URL-encode. Giữ `NODE_ENV=development` khi chạy HTTP local.

```powershell
npm test
npm start
```

Mở http://localhost:3000. Ứng dụng dừng nếu thiếu cấu hình hoặc không kết nối được Atlas; không dùng dữ liệu giả hay fallback session RAM.

## 1. Cấu hình Atlas

Trong **Database Access → Custom Roles**, tạo các role với resource cụ thể như bảng dưới. Sau đó gán từng role trong Database Users. Không gán thêm `readWrite`, `readWriteAnyDatabase` hoặc quyền quản trị cho các user ứng dụng.

| User | Custom role | Database / collection | Actions |
|---|---|---|---|
| `23IT139_read` | `books_read_23IT139` | `DB_23IT139.books` | `find` |
| `23IT139_write` | `books_insert_23IT139` | `DB_23IT139.books` | `insert` |
| `23IT139_session` | `sessions_23IT139` | `DB_23IT139.sessions` | `find`, `insert`, `update`, `remove` |

Role `read@DB_23IT139` hiện tại cho phép đọc cả database. Có thể dùng cho yêu cầu đọc của đề, nhưng nên thu hẹp thành `find` trên `books` để không đọc được session. Tài khoản write hiện tại bắt buộc phải bỏ `readWrite` và thay bằng custom role chỉ `insert`.

Tài khoản thứ ba chỉ phục vụ hạ tầng session, không có quyền trên sách. Session cần đọc, cập nhật và xóa nên không thể dùng một user chỉ đọc hoặc chỉ insert. Hai user nghiệp vụ sách vẫn độc lập đúng yêu cầu. Nếu giảng viên yêu cầu tổng cộng đúng hai user, cần làm rõ cách phân quyền session với giảng viên; không tự mở rộng quyền của user sách.

Dùng **tài khoản quản trị riêng** trong mongosh để chạy `scripts/atlas-init.mongodb.js` (hoặc tạo collection/index tương đương trong Atlas UI). Không lưu URI quản trị vào repo hay biến môi trường ứng dụng. Script tạo:

- `books`, unique index `{ code: 1 }` để từ chối mã trùng, index `{ createdAt: -1 }` để đọc sách mới nhất.
- `sessions`, TTL index `{ expires: 1 }` với `expireAfterSeconds: 0`. MongoDB tự xóa phiên hết hạn; tài khoản session không cần quyền tạo index.

Trong **Network Access**, thêm IP public máy local khi phát triển; khi deploy thêm các outbound IP của dịch vụ Render. Dùng URI Atlas `mongodb+srv://` có TLS mặc định. Không dùng `0.0.0.0/0` làm cấu hình lâu dài.

Điền URI của từng user vào đúng biến `MONGODB_READ_URI`, `MONGODB_WRITE_URI`, `MONGODB_SESSION_URI`. Code ép database từ MSSV, không phụ thuộc database mặc định trong URI.

## 2. Kiến trúc và luồng xử lý

```text
Trình duyệt (cookie mã phiên, HttpOnly / Secure trên HTTPS)
             │ HTTPS
        Render / cân bằng tải
             │
       Express instance 1 ... instance N
             ├── GET / → reader → Atlas books (find)
             ├── POST /books → writer → Atlas books (insert)
             └── express-session → session user → Atlas sessions
```

Các instance dùng chung `SESSION_SECRET` và Atlas. Không lưu trạng thái phiên trong MemoryStore hoặc file local, không cần sticky session. Dữ liệu phiên được nạp tạm để xử lý request; nguồn lưu trữ bền vững là MongoDB. Cookie chỉ chứa ID phiên đã ký, không chứa dữ liệu phiên.

`src/database.js` mở đồng thời ba pool độc lập. `src/books.js` điều hướng truy vấn qua đúng pool. POST kiểm tra CSRF và đầu vào, tính `VAT = (chữ số cuối MSSV + 5)%`, `tax = round(price × VAT / 100)`, `total = price + tax` trước khi insert. Giá là số nguyên VNĐ, làm tròn thuế đến đồng. Code không tin VAT/total gửi từ client. Handlebars escape dữ liệu và footer hiện tên, MSSV, VAT.

Danh sách giới hạn 100 sách mới nhất. Đây là ứng dụng bài tập: quyền DB bảo vệ đường truy vấn; chưa có tài khoản đăng nhập hay phân quyền người dùng cuối, nên khách truy cập đều có thể thêm sách qua biểu mẫu.

## 3. Git / DevOps

Repo đã có lịch sử thật: scaffold trên `main`, hai nhánh độc lập `feature/database` và `feature/session`, hai lần `git merge --no-ff`. Các thay đổi tích hợp giao diện, CI và deployment được commit tiếp trên main.

```powershell
git log --graph --oneline --decorate --all
git check-ignore .env
```

GitHub Actions chạy syntax check, tests và audit dependencies. `.gitignore` loại `.env`, cache, node_modules và logs. `.env.example` chỉ chứa placeholder, thông tin sinh viên không phải bí mật.

Tạo repository **Private** trên GitHub, không khởi tạo README để tránh lịch sử khác, rồi chạy với URL repository thật:

```powershell
git remote add origin https://github.com/YOUR_ACCOUNT/icloud-midterm.git
git push -u origin main
git push origin feature/database feature/session
```

Vào **Settings → Collaborators → Add people**, mời tài khoản GitHub giảng viên được cung cấp. Giữ repository Private, chờ giảng viên nhận lời mời. Không squash/rebase lịch sử hai merge node khi nộp bài.

## 4. Deploy Render

Kết nối GitHub với Render, chọn **New → Blueprint**, chọn repository private và dùng `render.yaml`. Blueprint chọn **Starter (có phí)**; kiểm tra chi phí trên Render trước khi tạo dịch vụ. Free ngủ sau 15 phút không truy cập, không phù hợp yêu cầu luôn chạy. Cấu hình stateless cho phép nhiều instance nhưng không tự bật autoscaling; việc scale cần gói Render hỗ trợ và thiết lập tương ứng.

Các URI được nhập trong giao diện **Environment** của Render, không đưa vào YAML. `SESSION_SECRET` được sinh khi tạo dịch vụ; nếu có nhiều dịch vụ/instance dùng cùng session thì phải dùng chung secret. `NODE_ENV=production` bật cookie Secure, Express tin một reverse proxy của Render. Nếu đổi cấu trúc proxy, cần cấu hình lại trust proxy theo hạ tầng.

Build: `npm ci --omit=dev`; start: `npm start`; health: `/healthz`. Render cấp HTTPS và PORT tự động. Thêm outbound IP Render vào Atlas trước khi deploy. `/healthz` kiểm tra kết nối ba client, không thay thế kiểm thử quyền collection.

## 5. Kiểm chứng và minh chứng nộp bài

1. Chụp Database Users / Custom Roles (ẩn thông tin bí mật), collections và indexes.
2. Thêm `139-001`, giá `100000`: kết quả `114000`, footer VAT 14%.
3. Gửi mã `138-001` (có thể cần bỏ kiểm tra HTML bằng DevTools): server trả 400, không insert. Mã trùng trả 409 khi unique index đã tạo.
4. Kiểm thử quyền bằng mongosh với từng user: reader đọc books được, insert bị Unauthorized; writer insert được, find/update/delete bị Unauthorized. Dùng dữ liệu thử và quản trị viên dọn sau. Session user chỉ truy cập sessions. Không chạy kiểm thử ghi lên dữ liệu cần giữ.
5. Giữ nguyên cookie trình duyệt, restart dịch vụ hoặc chuyển instance: trường “Phiên bắt đầu” không đổi. Kiểm tra Atlas có document session và TTL index. Không chia sẻ giá trị cookie/session ID khi chụp hình.
6. Chụp cây Git có hai merge node, repo Private, lời mời giảng viên, CI thành công và URL Render HTTPS hoạt động.

Tests tự động dùng kho session giả chỉ trong `test/` để xác minh hai Express instance chia sẻ phiên, CSRF, escaping, tính thuế, validation và điều hướng đọc/ghi. Chúng **không chứng minh** quyền Atlas hay session bền vững trên cloud; phải thực hiện kiểm tra thật ở trên sau khi cấu hình credentials.

## Tài liệu chính thức

- Atlas custom roles: https://www.mongodb.com/docs/atlas/security-add-mongodb-roles/
- MongoDB session store: https://github.com/jdesboeufs/connect-mongo
- Render Free limitations: https://render.com/docs/free
- Render scaling: https://render.com/docs/scaling

## Trạng thái bàn giao

Mã nguồn, kiểm thử local, lịch sử nhánh và cấu hình deployment đã chuẩn bị. Chưa xác minh Atlas thật, chưa push GitHub, chưa mời giảng viên, chưa tạo dịch vụ Render. Các bước này cần cấu hình tài khoản/URI, repository và tài khoản giảng viên.
