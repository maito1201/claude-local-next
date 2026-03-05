# claude-local-next

ローカル環境で Claude CLI を使うためのチャット Web UI（Next.js）
その他独自のUIコンポーネント実装などを行う上での素体の想定です

素体としてのチャットUIに加え、ブラウザの機能を使った音声入力機能と、
VOICEVOX を使った音声読み上げ機能が特徴です

## 前提条件

- Node.js
- [Claude CLI](https://docs.anthropic.com/en/docs/claude-cli) がインストール・認証済みであること
- （VOICEVOX 読み上げを使う場合）[VOICEVOX](https://voicevox.hiroshiba.jp/) が起動していること
  - アプリ版を起動するか、Docker で `docker run --rm -p 50021:50021 voicevox/voicevox_engine:latest`

## 使い方

```bash
npm install
npm run dev
```

http://localhost:3333 でアクセスできます。
