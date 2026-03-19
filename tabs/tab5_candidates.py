"""タブ5：候補者管理（登録・履歴・比較・AIマッチング）"""

import os
import json
from datetime import datetime, timedelta

import streamlit as st
import pandas as pd
from utils import load_jobs, call_claude

CANDIDATES_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "candidates.json")


def _load_candidates() -> list[dict]:
    if os.path.exists(CANDIDATES_FILE):
        with open(CANDIDATES_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def _save_candidates(candidates: list[dict]) -> None:
    with open(CANDIDATES_FILE, "w", encoding="utf-8") as f:
        json.dump(candidates, f, ensure_ascii=False, indent=2)


def render() -> None:
    st.header("候補者管理")
    st.caption("候補者の登録・面談履歴の記録・候補者同士の比較・AIマッチングができます。")

    candidates = _load_candidates()

    sub_tab = st.radio(
        "機能を選択",
        ["候補者一覧", "新規登録", "面談履歴を追加", "候補者比較", "AIマッチング"],
        horizontal=True,
    )

    # ──────────────────────────────────────────
    # 候補者一覧
    # ──────────────────────────────────────────
    if sub_tab == "候補者一覧":
        if not candidates:
            st.info("候補者がまだ登録されていません。「新規登録」から追加してください。")
            return

        # フィルター
        col_f1, col_f2 = st.columns(2)
        with col_f1:
            status_filter = st.multiselect(
                "ステータスで絞り込み",
                ["対応中", "面談済み", "紹介済み", "内定", "入社", "辞退", "保留"],
            )
        with col_f2:
            search_text = st.text_input("名前・現職で検索", placeholder="キーワードを入力")

        filtered = candidates
        if status_filter:
            filtered = [c for c in filtered if c.get("ステータス") in status_filter]
        if search_text:
            search_lower = search_text.lower()
            filtered = [
                c for c in filtered
                if search_lower in c.get("名前", "").lower()
                or search_lower in c.get("現職", "").lower()
                or search_lower in c.get("資格", "").lower()
            ]

        if not filtered:
            st.info("条件に合う候補者がいません。")
            return

        df = pd.DataFrame(filtered)
        display_cols = ["名前", "年齢", "現職", "希望条件", "ステータス", "登録日"]
        existing_cols = [c for c in display_cols if c in df.columns]
        st.dataframe(df[existing_cols], use_container_width=True)

        # 詳細表示
        names = [c["名前"] for c in filtered]
        selected = st.selectbox("詳細を見る候補者", names)
        if selected:
            cand = next(c for c in candidates if c["名前"] == selected)
            st.subheader(f"{cand['名前']} の詳細")

            col1, col2 = st.columns(2)
            with col1:
                st.markdown(f"**年齢:** {cand.get('年齢', '-')}")
                st.markdown(f"**現職:** {cand.get('現職', '-')}")
                st.markdown(f"**資格:** {cand.get('資格', '-')}")
            with col2:
                st.markdown(f"**希望条件:** {cand.get('希望条件', '-')}")
                st.markdown(f"**ステータス:** {cand.get('ステータス', '-')}")
                st.markdown(f"**登録日:** {cand.get('登録日', '-')}")

            st.markdown(f"**悩み・備考:** {cand.get('悩み', '-')}")

            # 面談履歴
            history = cand.get("面談履歴", [])
            if history:
                st.subheader("面談履歴")
                for i, h in enumerate(history, 1):
                    with st.expander(f"第{i}回 面談（{h.get('日付', '不明')}）"):
                        st.markdown(f"**メモ:** {h.get('メモ', '-')}")
                        st.markdown(f"**提案企業:** {h.get('提案企業', '-')}")
                        st.markdown(f"**ネクストアクション:** {h.get('ネクストアクション', '-')}")
                        if h.get("期限日"):
                            st.markdown(f"**期限日:** {h['期限日']}")

            # ステータス更新
            new_status = st.selectbox(
                "ステータスを更新",
                ["対応中", "面談済み", "紹介済み", "内定", "入社", "辞退", "保留"],
                index=0,
            )
            if st.button("ステータスを保存"):
                cand["ステータス"] = new_status
                _save_candidates(candidates)
                st.success(f"ステータスを「{new_status}」に更新しました。")
                st.rerun()

    # ──────────────────────────────────────────
    # 新規登録
    # ──────────────────────────────────────────
    elif sub_tab == "新規登録":
        st.subheader("候補者を新規登録")
        with st.form("candidate_form"):
            name = st.text_input("名前 *")
            age = st.text_input("年齢", placeholder="例: 32歳")
            current_job = st.text_input("現職", placeholder="例: サブコン空調設備施工管理")
            qualifications = st.text_input("資格", placeholder="例: 1級管工事施工管理技士")
            wishes = st.text_input("希望条件", placeholder="例: 年収500万以上、土日休み")
            concerns = st.text_area("悩み・備考", placeholder="例: 激務で体力的に限界、家族との時間が欲しい")

            submitted = st.form_submit_button("登録", type="primary")
            if submitted:
                if not name.strip():
                    st.warning("名前は必須です。")
                else:
                    new_candidate = {
                        "名前": name.strip(),
                        "年齢": age,
                        "現職": current_job,
                        "資格": qualifications,
                        "希望条件": wishes,
                        "悩み": concerns,
                        "ステータス": "対応中",
                        "登録日": datetime.now().strftime("%Y-%m-%d"),
                        "面談履歴": [],
                    }
                    candidates.append(new_candidate)
                    _save_candidates(candidates)
                    st.success(f"「{name}」を登録しました。")

                    # session_state にも反映（タブ1で使用可能に）
                    info_text = f"年齢：{age}\n現職：{current_job}\n資格：{qualifications}\n希望条件：{wishes}\n悩み：{concerns}"
                    st.session_state["candidate_info"] = info_text

    # ──────────────────────────────────────────
    # 面談履歴を追加
    # ──────────────────────────────────────────
    elif sub_tab == "面談履歴を追加":
        if not candidates:
            st.info("候補者がまだ登録されていません。")
            return

        names = [c["名前"] for c in candidates]
        selected = st.selectbox("候補者を選択", names)

        with st.form("history_form"):
            date = st.date_input("面談日")
            memo = st.text_area("面談メモ", placeholder="面談の要点を記録")
            proposed = st.text_input("提案した企業", placeholder="例: 三井不動産、NTTファシリティーズ")
            next_action = st.text_input("ネクストアクション", placeholder="例: 来週木曜に求人3社メール送付")
            deadline = st.date_input(
                "ネクストアクションの期限日",
                value=datetime.now() + timedelta(days=7),
                help="ダッシュボードのフォロー漏れアラートに反映されます",
            )

            submitted = st.form_submit_button("履歴を追加", type="primary")
            if submitted:
                cand = next(c for c in candidates if c["名前"] == selected)
                if "面談履歴" not in cand:
                    cand["面談履歴"] = []
                cand["面談履歴"].append({
                    "日付": date.strftime("%Y-%m-%d"),
                    "メモ": memo,
                    "提案企業": proposed,
                    "ネクストアクション": next_action,
                    "期限日": deadline.strftime("%Y-%m-%d"),
                })
                _save_candidates(candidates)
                st.success(f"「{selected}」の面談履歴を追加しました。")

    # ──────────────────────────────────────────
    # 候補者比較
    # ──────────────────────────────────────────
    elif sub_tab == "候補者比較":
        if len(candidates) < 2:
            st.info("比較するには2名以上の候補者が必要です。")
            return

        names = [c["名前"] for c in candidates]
        selected = st.multiselect("比較する候補者を選択（2〜4名）", names)

        if len(selected) >= 2:
            compare_data = []
            for name in selected:
                cand = next(c for c in candidates if c["名前"] == name)
                compare_data.append({
                    "名前": cand.get("名前", "-"),
                    "年齢": cand.get("年齢", "-"),
                    "現職": cand.get("現職", "-"),
                    "資格": cand.get("資格", "-"),
                    "希望条件": cand.get("希望条件", "-"),
                    "ステータス": cand.get("ステータス", "-"),
                    "面談回数": len(cand.get("面談履歴", [])),
                })

            compare_df = pd.DataFrame(compare_data).set_index("名前").T
            st.dataframe(compare_df, use_container_width=True)
        elif selected:
            st.warning("2名以上選択してください。")

    # ──────────────────────────────────────────
    # AIマッチング（候補者 × 求人の一括分析）
    # ──────────────────────────────────────────
    elif sub_tab == "AIマッチング":
        if not candidates:
            st.info("候補者がまだ登録されていません。")
            return

        active_candidates = [c for c in candidates if c.get("ステータス") in ["対応中", "面談済み"]]
        if not active_candidates:
            st.info("対応中または面談済みの候補者がいません。")
            return

        st.subheader("候補者 × 求人 AIマッチング")
        st.caption("対応中・面談済みの候補者に対して、最適な求人をAIが一括分析します。")

        names = [c["名前"] for c in active_candidates]
        selected_names = st.multiselect("分析する候補者を選択", names, default=names[:3])

        if st.button("一括マッチング分析", type="primary"):
            if not selected_names:
                st.warning("候補者を選択してください。")
                return

            jobs_df = load_jobs()
            jobs_text = jobs_df.to_csv(index=False)

            for name in selected_names:
                cand = next(c for c in active_candidates if c["名前"] == name)
                cand_info = (
                    f"名前: {cand.get('名前')}\n"
                    f"年齢: {cand.get('年齢', '-')}\n"
                    f"現職: {cand.get('現職', '-')}\n"
                    f"資格: {cand.get('資格', '-')}\n"
                    f"希望条件: {cand.get('希望条件', '-')}\n"
                    f"悩み: {cand.get('悩み', '-')}"
                )

                with st.expander(f"**{name}** のマッチング結果", expanded=True):
                    with st.spinner(f"{name}のマッチングを分析中..."):
                        prompt = f"""あなたは設備管理・施工管理業界に精通した人材紹介のプロフェッショナルです。
以下の候補者に最適な求人をTOP3で選び、それぞれ簡潔に推薦理由を述べてください。

【候補者情報】
{cand_info}

【求人リスト（CSV）】
{jobs_text}

以下の形式で回答してください:

| 順位 | 企業名 | 適合度 | 推薦理由（1行） | 提案の切り口 |
|------|--------|--------|-----------------|-------------|
| 1 | ... | ○○% | ... | ... |
| 2 | ... | ○○% | ... | ... |
| 3 | ... | ○○% | ... | ... |

**この候補者への次のアクション:** （具体的に何をすべきか1行で）"""
                        result = call_claude(prompt)
                    st.markdown(result)
