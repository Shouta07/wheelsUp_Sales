"""商談後サマリー生成ロジック"""

import logging

from openai import AsyncOpenAI

from app.core.config import settings
from app.services.pipedrive_client import get_deal, add_note, create_activity
from app.services.embedding import search_similar

logger = logging.getLogger(__name__)


async def generate_summary(
    deal_id: int,
    meeting_notes: str,
    duration_minutes: int = 60,
    attendees: list[str] | None = None,
) -> str:
    """商談メモから構造化サマリーを生成する。"""
    deal = await get_deal(deal_id)
    deal_title = deal.get("title", "不明")

    # 関連する過去情報を検索
    related = await search_similar(meeting_notes[:200], top_k=10)
    related_text = "\n\n".join([f"[過去情報] {c['text']}" for c in related])

    attendees_str = ", ".join(attendees) if attendees else "不明"

    prompt = f"""以下のメモをもとに、商談後サマリーを作成してください。

【案件名】{deal_title}
【商談時間】{duration_minutes}分
【参加者】{attendees_str}

【商談メモ】
{meeting_notes}

【関連する過去情報】
{related_text if related_text else '（過去情報なし）'}

以下の形式で出力してください：

## 商談サマリー
（3〜5行で要点を記述）

## 確認できた課題・ニーズ
-

## 合意事項
-

## ネクストアクション
| アクション | 担当 | 期日 |
|-----------|------|------|
|           |      |      |

## Pipedrive 更新推奨事項
- ステージ変更: （提案）
- 次回フォロー日: （提案）"""

    client = AsyncOpenAI(api_key=settings.openai_api_key)
    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=2000,
    )
    return response.choices[0].message.content


async def save_summary_to_pipedrive(deal_id: int, summary: str) -> dict:
    """生成したサマリーを Pipedrive の Note として保存する。"""
    return await add_note(deal_id, summary, pinned=True)
