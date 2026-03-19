"""タブ2：面談サポート（提案文面・反論トーク・キャリアパス生成）"""

import streamlit as st
from utils import load_jobs, call_claude, get_candidate_info


def render() -> None:
    st.header("面談サポート")
    st.caption("求人を選択して、候補者への提案文面・想定される懸念への切り返しトーク・キャリアパスを生成します。")

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

    # 生成オプション
    st.subheader("生成する内容")
    gen_options = st.multiselect(
        "生成したい項目を選択",
        ["スカウトメール", "トークスクリプト", "懸念点への切り返しトーク", "キャリアパス"],
        default=["スカウトメール", "懸念点への切り返しトーク"],
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

        # ── スカウトメール ──
        if "スカウトメール" in gen_options:
            st.subheader("スカウトメール")
            with st.spinner("スカウトメール文面を生成中..."):
                mail_prompt = f"""あなたは設備管理・施工管理業界に特化した人材紹介エージェントです。
以下の情報をもとに、候補者に送るスカウトメールを作成してください。

【ターゲット企業情報】
{job_info}

【候補者の背景】
{bg}

以下の形式で出力してください:

**件名:** （メール件名）

**本文:**
（メール本文。候補者の現状への共感→この企業の魅力→具体的なメリット→アクション誘導の構成で）"""
                mail_result = call_claude(mail_prompt)
            st.markdown(mail_result)
            # コピー用テキスト
            with st.expander("コピー用テキスト"):
                st.code(mail_result, language=None)

        # ── トークスクリプト ──
        if "トークスクリプト" in gen_options:
            st.subheader("面談用トークスクリプト")
            with st.spinner("トークスクリプトを生成中..."):
                talk_prompt = f"""あなたは設備管理・施工管理業界に特化した人材紹介エージェントです。
以下の情報をもとに、面談中に候補者に口頭で伝えるトークスクリプトを作成してください。

【ターゲット企業情報】
{job_info}

【候補者の背景】
{bg}

自然な会話形式で、以下の流れで構成してください:
1. 導入（候補者の状況への共感）
2. 企業紹介（なぜこの企業を提案するのか）
3. 具体的なメリット（候補者の悩みがどう解決されるか）
4. クロージング（次のアクションへの誘導）

※口語体で、「〜ですよね」「〜なんですが」など自然な話し言葉で書いてください"""
                talk_result = call_claude(talk_prompt)
            st.markdown(talk_result)

        # ── 懸念点への切り返しトーク ──
        if "懸念点への切り返しトーク" in gen_options:
            st.subheader("想定される懸念と切り返しトーク")
            with st.spinner("懸念点と切り返しトークを生成中..."):
                objection_prompt = f"""あなたは設備管理・施工管理業界の面談で10年以上の経験を持つトップエージェントです。
以下の企業を候補者に提案した際に、候補者から出そうな懸念・反論を予測し、それぞれに対する効果的な切り返しトークを作成してください。

【ターゲット企業情報】
{job_info}

【候補者の背景】
{bg}

以下の形式で、想定される懸念を5つ程度リストアップしてください:

### 懸念1: （候補者が言いそうなセリフ）
**よくある背景:** （なぜこの懸念が出るのか）
**切り返しトーク:** （具体的な返答例。データや実例を交えて）
**補足資料:** （もしあれば、見せると効果的な資料やデータ）

---

最後に、面談全体を通しての心構えを一言添えてください。"""
                objection_result = call_claude(objection_prompt)
            st.markdown(objection_result)

        # ── キャリアパス ──
        if "キャリアパス" in gen_options:
            st.subheader("入社後のキャリアパス（3〜5年後）")
            with st.spinner("キャリアパスを生成中..."):
                career_prompt = f"""あなたは設備管理・施工管理業界のキャリアコンサルタントです。
以下の企業に入社した場合の、3〜5年後までのキャリアパスを分かりやすく説明してください。

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

### 年収推移イメージ
| 時期 | 想定年収 | ポジション |
|------|----------|------------|

### この転職で得られる最大のメリット
（まとめ）"""
                career_result = call_claude(career_prompt)
            st.markdown(career_result)
