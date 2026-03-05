# claude-local-next

ローカル環境で Claude CLI を使うためのチャット Web UI（Next.js）
その他独自のUIコンポーネント実装などを行う上での素体の想定です

素体としてのチャットUIに加え、ブラウザの機能を使った音声入力機能と、
VOICEVOX を使った音声読み上げ機能が特徴です

## 前提条件

- Node.js
- [Claude CLI](https://docs.anthropic.com/en/docs/claude-cli) がインストール・認証済みであること
- （VOICEVOX 読み上げを使う場合）以下のいずれか:
  - [Docker](https://www.docker.com/) がインストールされていること（**推奨**: アプリ起動時に自動で Docker コンテナが立ち上がります）
  - または [VOICEVOX](https://voicevox.hiroshiba.jp/) アプリ版を手動で起動しておくこと

## 使い方

```bash
npm install
npm run dev
```

http://localhost:3333 でアクセスできます。
