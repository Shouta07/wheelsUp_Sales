"""候補者面談前ブリーフィング生成 — AIで事前準備を自動化。

候補者の現職企業・経歴・希望条件から：
1. 現職企業の特徴・業界ポジション分析
2. 推定ニーズ（なぜ転職したいのか）
3. 刺さる訴求ポイント
4. 紹介すべき企業候補（キーワードマッチ）
5. 面談トークスクリプト
を生成する。
"""

import logging

from openai import AsyncOpenAI
from sqlalchemy import func, select

from app.core.config import settings
from app.core.database import async_session
from app.models.candidate import Candidate
from app.models.company import Company

logger = logging.getLogger(__name__)


async def _match_companies_for_candidate(candidate: Candidate) -> list[dict]:
    """候補者の希望キーワードに基づき企業をマッチングする。"""
    desired = [kw.lower() for kw in (candidate.desired_keywords or [])]
    if not desired:
        return []

    async with async_session() as session:
        result = await session.execute(select(Company).order_by(Company.name))
        companies = result.scalars().all()

    matched = []
    for c in companies:
        company_kws = [k.lower() for k in (c.keywords or [])]
        hits = [kw for kw in desired if any(kw in ck for ck in company_kws)]
        if hits:
            pitch_lines = []
            for kw in hits:
                for orig_kw, point in (c.pitch_points or {}).items():
                    if kw in orig_kw.lower():
                        pitch_lines.append(f"{orig_kw}: {point}")
                        break
            matched.append({
                "company_id": str(c.id),
                "name": c.name,
                "score": len(hits),
                "matched_keywords": hits,
                "pitch_lines": pitch_lines,
                "address": c.address or "",
            })

    matched.sort(key=lambda m: m["score"], reverse=True)
    return matched[:10]


async def generate_candidate_briefing(candidate_id: str) -> dict:
    """候補者面談前ブリーフィングを生成する。

    Returns:
        {
            "briefing": str (markdown),
            "matched_companies": [...],
            "inferred_needs": {...}
        }
    """
    async with async_session() as session:
        result = await session.execute(
            select(Candidate).where(Candidate.id == candidate_id)
        )
        candidate = result.scalar_one_or_none()
        if not candidate:
            raise ValueError("候補者が見つかりません")

    # 企業マッチング
    matched = await _match_companies_for_candidate(candidate)

    # 候補者プロフィール構築
    profile = f"""名前: {candidate.name}
年齢: {candidate.age or '不明'}歳
現職企業: {candidate.current_company or '不明'}
現職ポジション: {candidate.current_position or '不明'}
業界: {candidate.current_industry or '不明'}
経験年数: {candidate.years_of_experience or '不明'}年
現在年収: {candidate.current_salary or '不明'}万円
保有資格: {', '.join(candidate.qualifications or []) or 'なし'}
希望条件: {', '.join(candidate.desired_keywords or []) or '未設定'}
希望年収: {candidate.desired_salary or '不明'}万円
希望勤務地: {candidate.desired_location or '不明'}
希望ポジション: {candidate.desired_position or '不明'}"""

    # マッチ企業情報
    companies_text = ""
    if matched:
        companies_text = "\n\n【マッチ企業候補】\n"
        for i, m in enumerate(matched[:5], 1):
            companies_text += f"\n{i}. {m['name']}（マッチ度: {m['score']}）"
            if m["pitch_lines"]:
                for pl in m["pitch_lines"]:
                    companies_text += f"\n   - {pl}"
            if m["address"]:
                companies_text += f"\n   所在地: {m['address']}"

    prompt = f"""あなたは wheelsUp 社のキャリアコンサルティングAIアシスタントです。
施設管理・建設マネジメント業界の人材紹介を行っています。

以下の候補者について面談前ブリーフィングを作成してください。

【候補者プロフィール】
{profile}
{companies_text}

以下の6項目をマークダウン形式で出力してください：

## 1. 現職企業分析
- {candidate.current_company or '（企業名）'}の業界ポジション・特徴
- 施設管理/建設業界における同社の評判
- この企業で働く人が感じやすい不満・課題

## 2. 推定ニーズ（転職動機の仮説）
- 現職の年収・ポジション・希望条件から推定される転職理由
- 表に出さない潜在的な不満（業界知見から推測）
- 転職の緊急度（高/中/低）の推定

## 3. 訴求すべきポイント
- この候補者に刺さる訴求キーワードと根拠
- 避けるべき地雷ワード

## 4. 紹介企業候補（上位3-5社）
- マッチ企業から、この候補者に最適な企業を推薦理由付きで
- 各企業の訴求トーク例（1-2文）

## 5. 面談トークスクリプト
- 最初の5分：アイスブレイク＋現職の状況確認
- 中盤10分：ニーズ深掘り質問リスト
- 後半5分：企業紹介＋次回アクション

## 6. リスク・注意点
- 候補者を失わないための注意事項
- フォローアップのタイミング提案"""

    client = AsyncOpenAI(api_key=settings.openai_api_key)
    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=3000,
    )
    briefing_text = response.choices[0].message.content

    # AI推定ニーズを構造化して保存
    needs_prompt = f"""以下の候補者プロフィールから、JSON形式で推定ニーズを出力してください。
キーは: likely_pain_points (array), motivation (string), risk_factors (array), recommended_approach (string)

{profile}

JSON のみ出力（説明不要）:"""

    needs_response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": needs_prompt}],
        max_tokens=500,
    )
    needs_text = needs_response.choices[0].message.content

    import json
    try:
        # JSONブロックを抽出
        clean = needs_text.strip()
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[1].rsplit("```", 1)[0]
        inferred_needs = json.loads(clean)
    except (json.JSONDecodeError, IndexError):
        inferred_needs = {"raw": needs_text}

    # DB に推定ニーズとマッチ企業を保存
    async with async_session() as session:
        result = await session.execute(
            select(Candidate).where(Candidate.id == candidate_id)
        )
        candidate = result.scalar_one_or_none()
        if candidate:
            candidate.inferred_needs = inferred_needs
            candidate.matched_companies = matched[:5]
            await session.commit()

    return {
        "briefing": briefing_text,
        "matched_companies": matched,
        "inferred_needs": inferred_needs,
    }
