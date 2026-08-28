# 習慣プランナー（PDCA型）

先週の実績が、翌週の計画を書き換える習慣プランナー。

一般的な習慣アプリは記録しかしない。このアプリは、崩れた事実を次の計画に反映する
ところまでを扱う（Plan → Do → Check → Act の環を閉じる）。

## 開発

```bash
npm install
npm run dev      # 開発サーバー
npm run build    # 型チェック + 本番ビルド
npm test         # 空き時間・自動配置ロジックのテスト（vitest）
npm run lint
```

## 技術構成

Vite + React + TypeScript / Tailwind CSS / date-fns / localStorage / vitest

## 進捗（設計図の工程）

- [x] Phase 0 — プロジェクト作成、Tailwind導入、5画面の骨組み
- [x] Phase 1 — データ層 + 習慣のCRUD
- [x] Phase 2 — 固定予定の登録 + 空き時間の算出
- [x] Phase 3 — 自動配置（Plan）
- [x] Phase 4 — 今日の画面 + 記録（Do）
- [ ] Phase 5 — 振り返り + 翌週提案（Act）
- [ ] Phase 6 — PWA化 + デプロイ

詳細な仕様は設計図を参照。
