# DevTools

**Môi trường dev nhẹ nhàng dành cho vibe coder.**

[English](README.md) | Tiếng Việt

IDE hiện đại đi kèm hàng trăm tính năng — debugger, profiler, refactoring wizard, database explorer, hệ thống extension, remote container, v.v. Hầu hết vibe coder không bao giờ dùng đến 90% trong số đó. Thứ họ thực sự cần chỉ là một terminal, một cách để xem thay đổi, và truy cập nhanh git. Mọi thứ còn lại chỉ là nhiễu.

DevTools loại bỏ sự cồng kềnh, chỉ giữ lại những gì cần thiết:

- **Terminal** — Split pane, multi-project tab, PTY tích hợp. Chỉ cần code.
- **Git** — Stage, diff, commit. Không menu, không wizard.
- **Editor** — Monaco Editor, chỉnh sửa file nhanh khi cần.
- **Browser** — Trình duyệt tích hợp để xem trước app mà không cần alt-tab.

Chỉ vậy thôi. Bốn view. Một sidebar. Không xao nhãng.

## Tại sao?

Vibe coding là về flow — bạn nói chuyện với AI, AI viết code, bạn chạy thử, xem kết quả, lặp lại. IDE nên tránh đường bạn, không phải bắt bạn chú ý vào settings panel, xung đột plugin, hay 50 nút toolbar.

DevTools được xây dựng cho workflow này:

1. Mở project
2. Chạy AI coding tool trong terminal
3. Xem trước thay đổi trong browser
4. Commit khi hài lòng

Không setup wizard. Không workspace config. Không "nên cài extension nào?" rabbit hole.

## Tech Stack

| Layer    | Tech                          |
| -------- | ----------------------------- |
| Shell    | Tauri v2 (Rust)               |
| Frontend | React 19, TypeScript, Vite    |
| Styling  | Tailwind CSS v4, Catppuccin   |
| Editor   | Monaco Editor                 |
| Terminal | xterm.js + portable-pty       |
| State    | Zustand                       |

## Bắt đầu

```bash
# Cài dependencies
npm install

# Chạy development
npm run tauri dev

# Build production
npm run tauri build
```

Yêu cầu: Node.js 18+, Rust toolchain, Tauri v2 CLI.

## Cấu trúc dự án

```
src/                    # React frontend
  components/           # UI components (terminal, git, editor, browser)
  stores/               # Zustand state management
  hooks/                # Custom React hooks
src-tauri/              # Rust backend
  src/
    lib.rs              # Tauri commands & PTY management
    git_ops.rs          # Git operations
    ssh_manager.rs      # SSH/SFTP support
    browser_ops.rs      # Embedded browser logic
```

## Giấy phép

MIT — xem [LICENSE](LICENSE) để biết chi tiết.
