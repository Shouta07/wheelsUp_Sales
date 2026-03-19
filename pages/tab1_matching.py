"""タブ1：事前準備＆マッチング（内部DB検索＋外部レコメンド）"""

import streamlit as st
import pandas as pd
from utils import (
    load_jobs, call_claude, extract_keywords,
    get_candidate_info, set_candidate_info,
)


def render() -> None:
    st.header("事前準備＆マッチング")
    st.caption("候補者の情報を入力し、内部DBからの求人検索と外部アタックリストの提案を行います。")

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

    if st.button("内部DBから検索＆外部レコメンド", type="primary"):
        if not candidate_info.strip():
            st.warning("候補者情報を入力してください。")
            return

        # session_state に保存 → 他タブでも参照可能
        set_candidate_info(candidate_info)

        jobs_df = load_jobs()

        # ── キーワード抽出 ──
        with st.spinner("候補者情報を解析中..."):
            parse_prompt = f"""以下の候補者情報から、求人検索に使うキーワードを抽出してJSON形式で返してください。
キーワードは求人CSVの「職種」「必須要件」「休日」「年収」「アピールポイント」カラムと照合します。
該当しそうな語句を幅広くリストアップしてください。

候補者情報:
{candidate_info}

以下のJSON形式で返答してください（他の文章は不要）:
{{"keywords": ["キーワード1", "キーワード2", ...]}}"""
            keywords_raw = call_claude(parse_prompt)

        keywords = extract_keywords(keywords_raw)

        # ── 内部DB検索 ──
        if keywords:
            mask = pd.Series([False] * len(jobs_df))
            search_cols = ["職種", "必須要件", "休日", "アピールポイント"]
            for kw in keywords:
                for col in search_cols:
                    mask = mask | jobs_df[col].str.contains(kw, case=False, na=False)
            matched = jobs_df[mask]
        else:
            matched = jobs_df

        st.subheader("内部DB検索結果")
        if matched.empty:
            st.info("条件に合う求人が見つかりませんでした。全件を表示します。")
            st.dataframe(jobs_df, use_container_width=True)
        else:
            st.success(f"{len(matched)}件の求人がマッチしました。")
            st.dataframe(matched, use_container_width=True)

        st.session_state["matched_jobs"] = matched if not matched.empty else jobs_df

        # ── 外部アタックリスト ──
        st.subheader("外部アタックリスト提案")
        with st.spinner("外部ターゲット企業を分析中..."):
            external_prompt = f"""あなたは設備管理・施工管理業界に精通した人材紹介エージェントのアドバイザーです。
以下の候補者情報をもとに、自社の求人DB（設備管理・施工管理系20社）には含まれていない可能性が高い、
この候補者に提案すべき「外部のターゲット企業群・業界」を5〜8社程度リストアップしてください。

【候補者情報】
{candidate_info}

以下の形式で出力してください:
## 外部アタックリスト候補

| # | 企業名 / 業界 | 推薦理由 |
|---|---|---|
| 1 | ... | ... |

## 総合コメント
（候補者の志向性に対する総合的なアドバイス）"""
            external_result = call_claude(external_prompt)
        st.markdown(external_result)
