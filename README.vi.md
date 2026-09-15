# Reminder Desktop

[English](README.md) · **Tiếng Việt**

Ứng dụng nhắc nhở cho máy tính: nhắc nghỉ ngơi, vươn vai, uống nước theo lịch của bạn. Ở Việt Nam còn có
**vòng quay chọn món** giúp quyết định trưa nay ăn gì, chiều uống gì.

Trang chủ: https://remind.asia · Hỗ trợ: https://remind.asia/support/ · Quyền riêng tư: https://remind.asia/privacy

## Tải về

Vào mục [**Releases**](../../releases/latest) và tải file hợp với máy bạn:

| Máy | File |
|---|---|
| Windows 10/11 | `Reminder_x.y.z_x64-setup.exe` |
| macOS chip Apple (M1 trở lên) | `Reminder_x.y.z_aarch64.dmg` |
| macOS chip Intel | `Reminder_x.y.z_x64.dmg` |

Các file `latest.json` và `.sig` phục vụ cơ chế tự cập nhật, bạn không cần tải.

## Cài đặt

**Windows**: chạy file `.exe`, app cài vào thư mục người dùng nên không cần quyền quản trị.
Windows SmartScreen có thể cảnh báo vì bản cài chưa mua chứng chỉ ký mã; chọn **More info** rồi **Run anyway**.

**macOS**: mở file `.dmg`, kéo Reminder vào Applications. App có chữ ký nhưng chưa được Apple công chứng
(notarize, cần tài khoản nhà phát triển trả phí) nên macOS sẽ hỏi lại ở lần mở đầu tiên:

- **macOS 15 Sequoia trở lên**: bấm đúp vào Reminder, đóng cảnh báo, rồi vào
  **System Settings > Privacy & Security**, kéo xuống mục **Security**, bấm **Open Anyway** ở dòng nhắc về
  Reminder, xác nhận bằng Touch ID hoặc mật khẩu.
- **macOS 14 trở xuống**: chuột phải (hoặc Control-click) vào Reminder trong Applications, chọn **Open**,
  rồi bấm **Open** lần nữa trong hộp thoại.

Nếu macOS báo **"Reminder is damaged and can't be opened"** thì nguyên nhân là cờ kiểm dịch gắn vào file lúc
tải. Mở Terminal và chạy:

```bash
xattr -dr com.apple.quarantine /Applications/Reminder.app
```

Rồi mở app lại.

## Dùng thế nào

- Giao diện mặc định là **tiếng Anh**. Vào **Settings > Language** chọn **Tiếng Việt** nếu muốn.
- App chạy ngầm ở khay hệ thống. Đóng cửa sổ là thu xuống khay chứ không thoát.
- Bật **Khởi động cùng máy** trong Cài đặt để app tự chạy khi mở máy.
- Cần yên tĩnh lúc họp: chuột phải icon ở khay rồi chọn tạm dừng thông báo, hoặc vào Cài đặt
  để tạm dừng 15 phút, 1 giờ, hoặc đến sáng mai. Hết giờ app tự bật lại.

## Tính năng Ăn uống chỉ có ở Việt Nam

Vòng quay chọn món ăn và đồ uống là nội dung riêng cho người dùng tại Việt Nam. Máy chủ xác định
quốc gia theo địa chỉ IP của bạn. Nếu bạn ở ngoài Việt Nam, tab **Ăn uống** sẽ hiện thông báo
"Chưa hỗ trợ ở quốc gia của bạn" và không có popup chọn món nào xuất hiện. Phần **nhắc nhở** vẫn
hoạt động đầy đủ ở mọi quốc gia.

## Kiểm tra và cập nhật phiên bản

App tự kiểm tra bản mới sau khi mở 15 giây, rồi 6 giờ một lần, và khi bạn bấm **Kiểm tra cập nhật**
trong Cài đặt. Có bản mới thì app hiện banner, bấm **Cập nhật ngay** là app tải, cài và khởi động lại.

Hai API công khai được dùng cho việc này, do máy chủ `remind.asia` cung cấp:

| Endpoint | Dùng để làm gì |
|---|---|
| `GET https://remind.asia/api/desktop/update/{target}/{arch}/{version}` | App hỏi có bản mới không. `target` là `windows` hoặc `darwin`, `arch` là `x86_64` hoặc `aarch64`, `version` là phiên bản đang cài. Trả **200** kèm `{version, notes, pub_date, url, signature}` khi có bản mới hơn, trả **204** khi đang là bản mới nhất. |
| `GET https://remind.asia/api/desktop/version` | Trả phiên bản mới nhất kèm link tải cho từng hệ điều hành. Trang chủ dùng endpoint này để hiện nút tải đúng máy bạn. |

Gói cập nhật được **ký bằng Ed25519 (minisign)**. Khoá công khai nằm trong `tauri.conf.json` của app;
app chỉ cài gói nào có chữ ký khớp khoá đó, nên không ai chen được bản cài giả vào giữa đường.

Ngoài ra app gửi định kỳ (30 phút một lần) về `POST https://remind.asia/api/ext/version` gồm: phiên bản
đang dùng, số lượt popup đã hiển thị theo mốc 5 phút, ngôn ngữ, và một mã cài đặt ngẫu nhiên. Không kèm
nội dung nhắc nhở, không kèm thông tin cá nhân. Máy chủ trả về câu nhắc hiển thị dưới popup và danh sách
món ăn cho người dùng ở Việt Nam.

## Dữ liệu của bạn

Nhắc nhở, bộ chọn món và cài đặt được lưu **trên máy bạn**. Xem chi tiết tại
https://remind.asia/privacy

## Tự build từ mã nguồn

App viết bằng [Tauri v2](https://tauri.app): phần vỏ Rust bọc giao diện vanilla JS thuần, không bundler,
không framework. Xem [DEVELOPING.vi.md](DEVELOPING.vi.md) để biết cần cài gì, cách chạy thử (`npm run dev`, hoặc
`npm run web` để mở giao diện trong trình duyệt thường) và cách phát hành.

Phần máy chủ mà app gọi tới (trang web và API kiểm tra phiên bản) nằm ở một repo riêng tư khác.

## Báo lỗi

Mở [Issues](../../issues) của repo này hoặc liên hệ qua https://remind.asia/support/
