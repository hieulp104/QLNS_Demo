# Shared components

`src/components` chỉ chứa giao diện dùng chung giữa nhiều module. Component chỉ
phục vụ một nghiệp vụ phải nằm trong `src/modules/<module>/components`.

## Cấu trúc

```text
components/
├── layout/                 # Khung ứng dụng và điều hướng toàn cục
├── patterns/               # Khối giao diện ghép từ nhiều UI primitive
│   ├── auth-brand-panel/
│   ├── document-upload/
│   ├── module-placeholder/
│   ├── page-header/
│   └── stat-card/
├── theme/                  # Theme runtime, token, asset và CSS theo biến thể
└── ui/                     # UI primitive, không chứa logic nghiệp vụ
    ├── actions/            # Button và link tương tác
    ├── data-display/       # Avatar, badge, bảng và hiển thị dữ liệu
    ├── feedback/           # Alert, dialog, empty state và progress
    ├── forms/              # Input, select, checkbox và form field
    ├── navigation/         # Tabs, pagination và stepper
    └── surfaces/           # Card, divider và icon tile
```

## Quy ước import

- Module nghiệp vụ import primitive từ public API ổn định:
  `import { Button, Input } from "@/components/ui"`.
- Pattern được import qua thư mục riêng để thể hiện rõ mức trừu tượng:
  `import { PageHeader } from "@/components/patterns/page-header"`.
- Component bên trong `ui/` import nhóm phụ thuộc trực tiếp, không import ngược
  từ barrel `@/components/ui`, nhằm tránh vòng phụ thuộc.
- Chỉ đặt `"use client"` ở entry point thật sự cần state, event handler, hook
  hoặc API trình duyệt; component còn lại giữ là Server Component mặc định.

Khi thêm component mới, ưu tiên mở rộng primitive hiện có. Chỉ tạo pattern khi
khối giao diện có ý nghĩa tái sử dụng rõ ràng ở từ hai màn hình trở lên.
