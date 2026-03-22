# wheelsUp RAG システム

## プロジェクト概要
Lark チャット情報を収集・ベクトル化し、Pipedrive と連携した商談支援 RAG システム。

## 重要な制約
- 個人のDMは収集しない（chat_type が "p2p" は除外）
- Lark 署名検証は必ず実施（セキュリティ必須要件）
- 環境変数はすべて .env で管理、ハードコード禁止

## コーディング規約
- Python: Black フォーマット、型ヒント必須、docstring 必須
- TypeScript: strict モード、関数コンポーネントのみ
- テスト: 各サービス関数に pytest カバレッジ 80% 以上

## よく使うコマンド
- バックエンド起動: `cd backend && uvicorn app.main:app --reload`
- フロントエンド起動: `cd frontend && npm run dev`
- DB 初期化: `python scripts/init_db.py`
- 全チャンネル一括取込: `python scripts/backfill_lark.py`
- テスト実行: `cd backend && pytest tests/ -v`
- Docker 起動: `cd infra && docker compose up -d`

## API キー取得先
- Lark: https://open.larksuite.com/app （App ID / App Secret）
- Pipedrive: Settings > Personal preferences > API
- OpenAI: https://platform.openai.com/api-keys

## アーキテクチャ
```
Lark Webhook → FastAPI → Redis Queue → Consumer → Embedding → Qdrant
                                                              ↕
Pipedrive API ← → FastAPI ← → React Frontend
                                    ↕
                              RAG Search (Qdrant + PostgreSQL)
```
