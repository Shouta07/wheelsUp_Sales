"""タブ1：事前準備＆マッチング（AIスコアリング＋外部レコメンド）"""

import json
import streamlit as st
import pandas as pd
from utils import (
    load_jobs, call_claude,
    get_candidate_info, set_candidate_info,
)


def render() -> None:
    st.header("事前準備＆マッチング")
    st.caption("候補者の情報を入力し、AIが求人との適合度を分析します。")

    # 候補者情報（session_state で他タブと共有）
    candidate_info = st.text_area(
        "候補者の事前情報を入力してください",
        value=get_candidate_info(),
        height=200,
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

    if st.button("AIマッチング分析を実行", type="primary"):
        if not candidate_info.strip():
            st.warning("候補者情報を入力してください。")
            return

        set_candidate_info(candidate_info)
        jobs_df = load_jobs()

        # ── AIスコアリング ──
        st.subheader("AIマッチング結果")
        with st.spinner("全求人との適合度を分析中..."):
            jobs_text = jobs_df.to_csv(index=False)
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
      "推薦理由": "候補者の〇〇な経験と希望に対して、この企業は△△の点で高くマッチ。",
      "懸念点": "年収レンジがやや低い可能性あり",
      "提案の切り口": "ワークライフバランスの大幅改善と将来のキャリアアップを軸に訴求"
    }}
  ]
}}

全求人について適合度（0〜100）を算出し、適合度60以上のものだけ返してください。
適合度の基準:
- 90〜100: 希望条件にほぼ完全一致、即提案すべき
- 70〜89: 高い適合度、積極的に提案可能
- 60〜69: 条件は一部合致、候補者の志向次第で提案可能
- 60未満: 返答不要"""
            scoring_raw = call_claude(scoring_prompt)

        # パース
        try:
            # JSON部分を抽出
            json_start = scoring_raw.find("{")
            json_end = scoring_raw.rfind("}") + 1
            if json_start >= 0 and json_end > json_start:
                result = json.loads(scoring_raw[json_start:json_end])
                rankings = result.get("rankings", [])
            else:
                rankings = []
        except (json.JSONDecodeError, KeyError):
            rankings = []

        if rankings:
            # マッチした企業名リストを保持
            matched_names = [r["企業名"] for r in rankings]
            matched = jobs_df[jobs_df["企業名"].isin(matched_names)]
            st.session_state["matched_jobs"] = matched if not matched.empty else jobs_df

            for i, r in enumerate(rankings, 1):
                score = r.get("適合度", 0)
                if score >= 90:
                    icon = "🟢"
                elif score >= 70:
                    icon = "🔵"
                else:
                    icon = "🟡"

                with st.expander(f"{icon} {i}. {r['企業名']}（適合度: {score}%）", expanded=(i <= 3)):
                    col1, col2 = st.columns([1, 3])
                    with col1:
                        st.metric("適合度", f"{score}%")
                    with col2:
                        st.markdown(f"**推薦理由:** {r.get('推薦理由', '-')}")
                        st.markdown(f"**懸念点:** {r.get('懸念点', '-')}")
                        st.markdown(f"**提案の切り口:** {r.get('提案の切り口', '-')}")

                    # 求人詳細も表示
                    job_row = jobs_df[jobs_df["企業名"] == r["企業名"]]
                    if not job_row.empty:
                        row = job_row.iloc[0]
                        st.caption(f"職種: {row['職種']} ／ 年収: {row['年収']} ／ 休日: {row['休日']}")
        else:
            st.warning("マッチング結果を解析できませんでした。以下がAIの回答です。")
            st.markdown(scoring_raw)
            st.session_state["matched_jobs"] = jobs_df

        # ── 外部アタックリスト ──
        st.divider()
        st.subheader("外部アタックリスト提案")
        with st.spinner("外部ターゲット企業を分析中..."):
            internal_companies = ", ".join(jobs_df["企業名"].tolist())
            external_prompt = f"""あなたは設備管理・施工管理業界に精通した人材紹介エージェントのアドバイザーです。
以下の候補者情報をもとに、内部DBに含まれていない企業で、この候補者に提案すべきターゲット企業を5〜8社リストアップしてください。

【候補者情報】
{candidate_info}

【内部DBの企業（除外対象）】
{internal_companies}

以下の形式で出力してください:

## 外部アタックリスト候補

| # | 企業名 | 業界・ポジション | 推薦理由 | 想定年収 |
|---|--------|------------------|----------|----------|
| 1 | ... | ... | ... | ... |

## 攻め方のアドバイス
（これらの企業にアプローチする際のポイント・注意点）"""
            external_result = call_claude(external_prompt)
        st.markdown(external_result)
