# Contributing to omni-compress

Thank you for your interest in contributing to **omni-compress**! We appreciate your help in making this a truly universal compression engine.

## 🛠️ Development Setup

The project uses a monorepo structure managed by **Bun** and **npm workspaces**.

### Prerequisites
- [Rust](https://www.rust-lang.org/tools/install) (latest stable)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/)
- [Bun](https://bun.sh/) (for monorepo management)

### Local Workflow
1.  **Fork and clone** the repository.
2.  **Install dependencies**:
    ```bash
    bun install
    ```
3.  **Build the WASM engine**:
    ```bash
    bun run build:rust
    ```
4.  **Start the development server**:
    ```bash
    bun run dev:client
    ```

## 🏗️ Project Structure
- `packages/omni-compress`: The core Rust library.
- `apps/playground`: The React app for testing and benchmarking.

## ✅ Contribution Guidelines
- **Rust**: Ensure all code is formatted with `cargo fmt`.
- **TypeScript**: Use `bun run lint` in the playground to check for issues.
- **Tests**: Add tests for new compression features in Rust or integration tests in the playground.

## 🚀 Submitting a Pull Request
1. Create a new feature branch: `git checkout -b feat/my-new-feature`.
2. Commit your changes with clear, descriptive messages.
3. Push to your branch and open a PR against the `main` branch.

## ⚖️ Code of Conduct
Please be respectful and professional in all interactions. We follow the standard Contributor Covenant Code of Conduct.
