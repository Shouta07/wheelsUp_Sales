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
        # 1回のAPI呼出しでマッチング＋準備シート＋外部リストを一括生成
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        with st.spinner("マッチング・準備シート・外部リストを一括生成中..."):
            internal_companies = ", ".join(jobs_df["企業名"].tolist())
            combined_prompt = f"""あなたは設備管理・施工管理業界に精通した人材紹介のプロフェッショナルです（年間50名以上の成約実績）。
以下の3つのタスクをすべて実行してください。

【候補者情報】
{candidate_info}

【求人リスト（CSV形式）】
{jobs_text}

━━━━━━━━━━━━━━━━━━━━
タスク1: 求人マッチング
━━━━━━━━━━━━━━━━━━━━
候補者と求人リストを照合し、適合度60以上のものをランキング。

━━━━━━━━━━━━━━━━━━━━
タスク2: 商談準備シート
━━━━━━━━━━━━━━━━━━━━
タスク1の結果TOP3を踏まえた商談準備シート。

━━━━━━━━━━━━━━━━━━━━
タスク3: 外部アタックリスト
━━━━━━━━━━━━━━━━━━━━
内部DBに含まれていない企業を5〜8社。
【内部DB企業（除外）】{internal_companies}

━━━━━━━━━━━━━━━━━━━━
出力形式（厳守・JSON以外の文章は不要）
━━━━━━━━━━━━━━━━━━━━
{{
  "rankings": [
    {{
      "企業名": "企業名",
      "適合度": 85,
      "一言": "候補者にとってのこの企業の最大の魅力を1文で",
      "提案の切り口": "この求人をどう切り出すか"
    }}
  ],
  "prep_sheet": {{
    "候補者タイプ": "逃げ型・攻め型・迷い型など",
    "商談ゴール": "この商談で達成すべき具体的なゴール",
    "掴み": "開始5分の具体的なセリフ",
    "深掘り": [
      {{"推測": "...", "質問": "..."}},
      {{"推測": "...", "質問": "..."}},
      {{"推測": "...", "質問": "..."}}
    ],
    "ストーリーライン": "TOP3をどの順番で、どう繋げて提案するか",
    "地雷ワード": "言ってはいけないこと"
  }},
  "external_targets": [
    {{
      "企業名": "企業名",
      "ポジション": "...",
      "魅力": "候補者にとっての魅力",
      "想定年収": "..."
    }}
  ],
  "attack_advice": "外部企業への攻め方の一言アドバイス"
}}"""
            scoring_raw = call_claude(combined_prompt)

        # パース
        rankings = []
        prep_sheet = {}
        external_targets = []
        attack_advice = ""
        try:
            json_start = scoring_raw.find("{")
            json_end = scoring_raw.rfind("}") + 1
            if json_start >= 0 and json_end > json_start:
                result = json.loads(scoring_raw[json_start:json_end])
                rankings = result.get("rankings", [])
                prep_sheet = result.get("prep_sheet", {})
                external_targets = result.get("external_targets", [])
                attack_advice = result.get("attack_advice", "")
        except (json.JSONDecodeError, KeyError):
            pass

        # ── 1. マッチング結果 ──
        st.subheader("1. マッチング結果")
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

        # ── 2. 商談準備シート ──
        st.divider()
        st.subheader("2. 商談準備シート")
        if prep_sheet:
            st.markdown(f"## この候補者のタイプ\n{prep_sheet.get('候補者タイプ', '-')}")
            st.markdown(f"## 商談のゴール\n{prep_sheet.get('商談ゴール', '-')}")
            st.markdown(f"## 開始5分の掴み\n{prep_sheet.get('掴み', '-')}")
            st.markdown("## 深掘りすべきポイント")
            for j, d in enumerate(prep_sheet.get("深掘り", []), 1):
                st.markdown(f"{j}. 推測: {d.get('推測', '-')} → 質問: 「{d.get('質問', '-')}」")
            st.markdown(f"## 提案のストーリーライン\n{prep_sheet.get('ストーリーライン', '-')}")
            st.markdown(f"## 地雷ワード\n{prep_sheet.get('地雷ワード', '-')}")
        else:
            st.info("商談準備シートの生成結果がありません。")

        # ── 3. 外部アタックリスト ──
        st.divider()
        st.subheader("3. 外部アタックリスト")
        if external_targets:
            ext_df = pd.DataFrame(external_targets)
            st.dataframe(ext_df, use_container_width=True)
            if attack_advice:
                st.markdown(f"**攻め方の一言アドバイス:** {attack_advice}")
        else:
            st.info("外部アタックリストの生成結果がありません。")
