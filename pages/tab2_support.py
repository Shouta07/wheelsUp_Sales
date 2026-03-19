"""タブ2：面談サポート（提案文面＆キャリアパス生成）"""

import streamlit as st
from utils import load_jobs, call_claude, get_candidate_info


def render() -> None:
    st.header("面談サポート（提案文面＆キャリアパス生成）")
    st.caption("求人を選択して、候補者への提案文面とキャリアパスを生成します。")

    # 企業選択
    matched = st.session_state.get("matched_jobs", None)
    if matched is not None and not matched.empty:
        company_options = matched["企業名"].tolist()
    else:
        company_options = load_jobs()["企業名"].tolist()

    col1, col2 = st.columns([3, 1])
    with col1:
        selected_company = st.selectbox("提案する企業を選択", company_options)
    with col2:
        custom_company = st.text_input("または企業名を入力")

    target_company = custom_company.strip() if custom_company.strip() else selected_company

    # 候補者情報（タブ1 から自動引き継ぎ）
    candidate_context = st.text_area(
        "候補者の背景",
        value=get_candidate_info(),
        height=120,
        placeholder="例：サブコン空調施工管理5年、激務に疲弊、発注者側希望、年収500万以上",
    )

    if st.button("提案を生成", type="primary"):
        if not target_company:
            st.warning("企業名を選択または入力してください。")
            return

        # 求人詳細を取得
        jobs_df = load_jobs()
        job_row = jobs_df[jobs_df["企業名"] == target_company]
        job_detail = ""
        if not job_row.empty:
            row = job_row.iloc[0]
            job_detail = (
                f"企業名: {row['企業名']}\n職種: {row['職種']}\n年収: {row['年収']}\n"
                f"必須要件: {row['必須要件']}\n休日: {row['休日']}\nアピールポイント: {row['アピールポイント']}"
            )

        job_info = job_detail if job_detail else f"企業名: {target_company}（詳細情報なし・一般的な業界知識で補完）"
        bg = candidate_context if candidate_context else "（詳細不明）"

        # ── 提案文面 ──
        st.subheader("提案文面（スカウトメール / トークスクリプト）")
        with st.spinner("提案文面を生成中..."):
            proposal_prompt = f"""あなたは設備管理・施工管理業界に特化した人材紹介エージェントです。
以下の情報をもとに、候補者に対する魅力的な提案文面を2種類作成してください。

【ターゲット企業情報】
{job_info}

【候補者の背景】
{bg}

設備・施工管理業界の「勝ちパターン」を意識してください:
- 激務のサブコンから発注者側・デベロッパーへのスライド
- 現場管理からFM（ファシリティマネジメント）への転身
- ゼネコン設備部門から専業サブコンの幹部候補へ
- 施工管理経験を活かした設計・積算へのキャリアチェンジ

## 1. スカウトメール文面
（メールとして送れる形式で、件名・本文を作成）

## 2. 面談用トークスクリプト
（面談中に口頭で伝えるイメージ。候補者の不安に寄り添いつつ、転職のメリットを具体的に伝える）"""
            proposal_result = call_claude(proposal_prompt)
        st.markdown(proposal_result)

        # ── キャリアパス ──
        st.subheader("入社後のキャリアパス（3〜5年後）")
        with st.spinner("キャリアパスを生成中..."):
            career_prompt = f"""あなたは設備管理・施工管理業界のキャリアコンサルタントです。
以下の企業に入社した場合の、3〜5年後までのキャリアパスを分かりやすく図解してください。

【企業情報】
{job_info}

【候補者の背景】
{bg}

以下の形式で出力してください:

## キャリアパスロードマップ

### 入社〜1年目
（内容）

### 2〜3年目
（内容）

### 4〜5年目
（内容）

### キャリアパスフロー図
```
入社 → ステップ1 → ステップ2 → ステップ3 → 将来像
```

### 年収推移イメージ
| 時期 | 想定年収 | ポジション |
|------|----------|------------|

### この転職で得られる最大のメリット
（まとめ）"""
            career_result = call_claude(career_prompt)
        st.markdown(career_result)
