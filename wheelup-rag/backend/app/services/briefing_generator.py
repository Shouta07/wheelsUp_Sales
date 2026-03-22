"""商談前ブリーフィング生成ロジック"""

import logging

from openai import AsyncOpenAI

from app.core.config import settings
from app.services.pipedrive_client import get_deal, get_person, get_organization, get_deal_activities
from app.services.embedding import search_similar

logger = logging.getLogger(__name__)


async def generate_briefing(deal_id: int) -> str:
    """Pipedrive Deal + 関連ナレッジからブリーフィングを生成する。"""
    # Pipedrive から案件情報を収集
    deal = await get_deal(deal_id)
    deal_title = deal.get("title", "不明")
    org_id = deal.get("org_id", {}).get("value") if isinstance(deal.get("org_id"), dict) else deal.get("org_id")
    person_id = deal.get("person_id", {}).get("value") if isinstance(deal.get("person_id"), dict) else deal.get("person_id")

    org_info = await get_organization(org_id) if org_id else {}
    person_info = await get_person(person_id) if person_id else {}
    activities = await get_deal_activities(deal_id)

    # 企業名・担当者名で関連チャンクを検索
    org_name = org_info.get("name", "")
    person_name = person_info.get("name", "")
    search_query = f"{org_name} {person_name} {deal_title}".strip()

    related_chunks = await search_similar(search_query, top_k=15)
    chunks_text = "\n\n".join([f"[{c['source'].get('chat_type', '')}] {c['text']}" for c in related_chunks])

    # 案件コンテキスト構築
    deal_context = f"""案件名: {deal_title}
企業: {org_name or '不明'}
担当者: {person_name or '不明'}
ステージ: {deal.get('stage_id', '不明')}
金額: {deal.get('value', '未設定')} {deal.get('currency', '')}
直近アクティビティ数: {len(activities)}件"""

    if activities:
        recent = activities[:5]
        deal_context += "\n\n直近のアクティビティ:\n"
        for act in recent:
            deal_context += f"- [{act.get('due_date', '')}] {act.get('subject', '')} ({act.get('type', '')})\n"

    prompt = f"""あなたは wheelsUp 社の商談支援AIです。
以下の情報をもとに、商談前ブリーフィングを作成してください。

【Pipedrive 案件情報】
{deal_context}

【関連チャンネルの過去ログ（Lark）】
{chunks_text if chunks_text else '（関連情報なし）'}

以下の観点でまとめてください：
1. 企業概要・意思決定構造（誰が決める？）
2. 候補者プロフィール・過去の発言傾向・懸念事項
3. 前回商談の要点・積み残し課題
4. 刺さりそうな製品・サービス（過去の関心キーワードから）
5. 注意すべきリスク・地雷
6. 推奨アプローチ（最初の5分で話すべきこと）

マークダウン形式で出力してください。"""

    client = AsyncOpenAI(api_key=settings.openai_api_key)
    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=2000,
    )
    return response.choices[0].message.content
