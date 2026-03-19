# 🤝 Contributing to Omni Compress

First off, thank you for taking the time to contribute! 🎉 We welcome all bug reports, feature requests, and pull requests.

## 🛠️ Development Setup

This project uses [Bun](https://bun.sh/) for blazingly fast dependency management and script execution. It is structured as a monorepo.

### Prerequisites
- Install [Bun](https://bun.sh/docs/installation)

### Getting Started

1. **Clone the repository and install dependencies:**
   ```bash
   git clone https://github.com/dharanish-v/omni-compress.git
   cd omni-compress
   bun install
   ```

2. **Run the local development server:**
   ```bash
   bun run dev
   ```
   This command concurrently watches the library (`packages/omni-compress`) for changes and runs the React playground (`apps/playground`) on a local port.

3. **Build the packages:**
   ```bash
   bun run build
   ```

## 📂 Project Structure

```text
/
├── packages/omni-compress/ # The core NPM library
│   ├── src/
│   │   ├── adapters/       # Environment-specific logic (browser vs node)
│   │   ├── core/           # Routing and shared utilities
│   │   ├── workers/        # Web Worker entry points
│   │   └── index.ts        # Main package export
│   └── tsup.config.ts      # Bundler configuration
│
└── apps/playground/        # Vite + React Demo Application
    ├── src/
    │   ├── App.tsx         # Picasso-themed UI
    │   └── index.css       # Tailwind v4 configuration
    └── vite.config.ts
```

## ✅ Commit Guidelines

To maintain a clean history, please follow these guidelines:
- **Be concise.** Use short, descriptive commit messages.
- **Use Conventional Commits:** Start your commit with a type (e.g., `feat:`, `fix:`, `docs:`, `refactor:`).
- **Ensure Quality:** Make sure all `eslint` and TypeScript errors are resolved before pushing.

## 🚀 Pull Request Process

1. Fork the repository.
2. Create a new feature branch (`git checkout -b feature/amazing-feature`).
3. Make your changes, following the architectural rules (Zero-Copy Transfers, Memory Safety).
4. Commit your changes (`git commit -m 'feat: add amazing feature'`).
5. Push to the branch (`git push origin feature/amazing-feature`).
6. Open a Pull Request targeting the `main` branch.

We look forward to reviewing your PR!
