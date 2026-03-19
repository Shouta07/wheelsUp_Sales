"""商談前 — 準備（マッチング＋準備シート＋提案素材を一括生成）"""

import json
import streamlit as st
import pandas as pd
from utils import load_jobs, call_claude, get_candidate_info, set_candidate_info


def render() -> None:
    st.header("商談前 — 準備")
    st.caption("候補者情報を入力すると、マッチング・準備シート・提案素材をまとめて生成します。")

    # ── 候補者情報入力 ──
    candidate_info = st.text_area(
        "候補者の事前情報",
        value=get_candidate_info(),
        height=180,
        placeholder=(
            "例：\n"
            "年齢：32歳\n"
            "現職：サブコン（空調設備施工管理）5年目\n"
            "悩み：激務で残業月80h、土日出勤が多い\n"
            "希望条件：年収500万以上、土日休み、発注者側やデベロッパーに興味\n"
            "資格：1級管工事施工管理技士"
        ),
        key="candidate_info_input",
    )

    if st.button("商談準備を一括生成", type="primary", use_container_width=True):
        if not candidate_info.strip():
            st.warning("候補者情報を入力してください。")
            return

        set_candidate_info(candidate_info)
        jobs_df = load_jobs()
        jobs_text = jobs_df.to_csv(index=False)

        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # 1. AIマッチング
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        st.subheader("1. マッチング結果")
        with st.spinner("求人との適合度を分析中..."):
            scoring_prompt = f"""あなたは設備管理・施工管理業界に精通した人材紹介のプロフェッショナルです。
以下の候補者情報と求人リストを照合し、適合度の高い順にランキングしてください。

【候補者情報】
{candidate_info}

【求人リスト（CSV形式）】
{jobs_text}

以下のJSON形式で返答してください（他の文章は不要）:
{{
  "rankings": [
    {{
      "企業名": "企業名",
      "適合度": 85,
      "一言": "候補者にとってのこの企業の最大の魅力を1文で",
      "提案の切り口": "この求人をどう切り出すか"
    }}
  ]
}}

適合度60以上のものだけ返してください。"""
            scoring_raw = call_claude(scoring_prompt)

        rankings = []
        try:
            json_start = scoring_raw.find("{")
            json_end = scoring_raw.rfind("}") + 1
            if json_start >= 0 and json_end > json_start:
                result = json.loads(scoring_raw[json_start:json_end])
                rankings = result.get("rankings", [])
        except (json.JSONDecodeError, KeyError):
            pass

        if rankings:
            matched_names = [r["企業名"] for r in rankings]
            matched = jobs_df[jobs_df["企業名"].isin(matched_names)]
            st.session_state["matched_jobs"] = matched if not matched.empty else jobs_df
            st.session_state["rankings"] = rankings

            for i, r in enumerate(rankings, 1):
                score = r.get("適合度", 0)
                icon = "🟢" if score >= 90 else ("🔵" if score >= 70 else "🟡")
                with st.expander(f"{icon} {i}. {r['企業名']}（{score}%）", expanded=(i <= 3)):
                    st.markdown(f"**魅力:** {r.get('一言', '-')}")
                    st.markdown(f"**提案の切り口:** {r.get('提案の切り口', '-')}")
                    job_row = jobs_df[jobs_df["企業名"] == r["企業名"]]
                    if not job_row.empty:
                        row = job_row.iloc[0]
                        st.caption(f"職種: {row['職種']} ／ 年収: {row['年収']} ／ 休日: {row['休日']}")
        else:
            st.markdown(scoring_raw)
            st.session_state["matched_jobs"] = jobs_df
            st.session_state["rankings"] = []

        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # 2. 商談準備シート
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        st.divider()
        st.subheader("2. 商談準備シート")
        with st.spinner("準備シートを生成中..."):
            top_companies = ", ".join([r["企業名"] for r in rankings[:3]]) if rankings else "（マッチ企業なし）"
            prep_prompt = f"""あなたは設備管理・施工管理業界の人材紹介で年間50名以上の成約実績を持つトップエージェントです。
以下の候補者との商談に向けた準備シートを作成してください。

【候補者情報】
{candidate_info}

【提案予定企業TOP3】
{top_companies}

以下の形式で出力してください:

## この候補者のタイプ
（転職動機のパターンを一言で。例：「逃げ型（現状の不満解消）」「攻め型（キャリアアップ志向）」「迷い型（漠然とした不安）」）

## 商談のゴール
（この商談で達成すべき具体的なゴール。例：「TOP3のうち2社に興味を持ってもらい、職務経歴書の準備に着手させる」）

## 開始5分の掴み
（候補者の心を開く最初のトーク。具体的なセリフで）

## 深掘りすべきポイント
（候補者情報から読み取れる「まだ言語化されていない本音」を3つ推測し、引き出すための質問）
1. 推測: ... → 質問: 「...」
2. 推測: ... → 質問: 「...」
3. 推測: ... → 質問: 「...」

## 提案のストーリーライン
（TOP3をどの順番で、どう繋げて提案するかのシナリオ）

## 地雷ワード（言ってはいけないこと）
（この候補者に対して逆効果になりそうな言葉・アプローチ）"""
            prep_result = call_claude(prep_prompt)
        st.markdown(prep_result)

        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # 3. 外部アタックリスト
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        st.divider()
        st.subheader("3. 外部アタックリスト")
        with st.spinner("DB外のターゲット企業を分析中..."):
            internal_companies = ", ".join(jobs_df["企業名"].tolist())
            external_prompt = f"""あなたは設備管理・施工管理業界に精通した人材紹介エージェントです。
以下の候補者に提案すべき、内部DBに含まれていない企業を5〜8社リストアップしてください。

【候補者情報】
{candidate_info}

【内部DBの企業（除外）】
{internal_companies}

| # | 企業名 | ポジション | 候補者にとっての魅力 | 想定年収 |
|---|--------|-----------|-------------------|----------|
| 1 | ... | ... | ... | ... |

**攻め方の一言アドバイス:**"""
            external_result = call_claude(external_prompt)
        st.markdown(external_result)
