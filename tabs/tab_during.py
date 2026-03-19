"""商談中 — 実戦（リアルタイム参照ツール）"""

import streamlit as st
from utils import load_jobs, call_claude, get_candidate_info


def render() -> None:
    st.header("商談中 — 実戦")
    st.caption("面談中にサッと使える支援ツール。タブを切り替えて使ってください。")

    bg = get_candidate_info()
    if not bg:
        st.info("「商談前 — 準備」で候補者情報を入力してください。情報が自動で引き継がれます。")

    tool = st.radio(
        "ツール",
        ["企業を提案する", "切り返しトーク", "その場で質問を考える"],
        horizontal=True,
    )

    # ──────────────────────────────────────────
    # 企業を提案する
    # ──────────────────────────────────────────
    if tool == "企業を提案する":
        matched = st.session_state.get("matched_jobs", None)
        if matched is not None and not matched.empty:
            company_options = matched["企業名"].tolist()
        else:
            company_options = load_jobs()["企業名"].tolist()

        col1, col2 = st.columns([3, 1])
        with col1:
            selected_company = st.selectbox("企業を選択", company_options)
        with col2:
            custom_company = st.text_input("or 入力")

        target_company = custom_company.strip() if custom_company.strip() else selected_company

        # マッチング結果から切り口を表示
        rankings = st.session_state.get("rankings", [])
        for r in rankings:
            if r.get("企業名") == target_company:
                st.info(f"**提案の切り口:** {r.get('提案の切り口', '')}")
                break

        gen_type = st.radio(
            "生成内容",
            ["トークスクリプト（口頭用）", "スカウトメール（送付用）", "キャリアパス（見せる用）"],
            horizontal=True,
        )

        if st.button("生成", type="primary"):
            jobs_df = load_jobs()
            job_row = jobs_df[jobs_df["企業名"] == target_company]
            if not job_row.empty:
                row = job_row.iloc[0]
                job_info = (
                    f"企業名: {row['企業名']}\n職種: {row['職種']}\n年収: {row['年収']}\n"
                    f"必須要件: {row['必須要件']}\n休日: {row['休日']}\nアピールポイント: {row['アピールポイント']}"
                )
            else:
                job_info = f"企業名: {target_company}（詳細情報なし・業界知識で補完）"

            candidate = bg if bg else "（候補者情報なし）"

            if gen_type == "トークスクリプト（口頭用）":
                with st.spinner("トークスクリプトを生成中..."):
                    prompt = f"""あなたは設備管理・施工管理業界の人材紹介エージェントです。
面談中に候補者に口頭で企業を紹介するトークスクリプトを作成してください。

【企業情報】
{job_info}

【候補者の背景】
{candidate}

自然な口語体で、以下の流れで:
1. 「実は〇〇さんにぜひご紹介したい企業がありまして」（導入）
2. なぜこの企業を紹介するのか（候補者の悩みとの接続）
3. 具体的な魅力（数字を入れて）
4. 「一度話を聞いてみませんか？」（クロージング）

※「〜なんですよ」「〜ですよね」など自然な話し言葉で"""
                    result = call_claude(prompt)

            elif gen_type == "スカウトメール（送付用）":
                with st.spinner("スカウトメールを生成中..."):
                    prompt = f"""あなたは設備管理・施工管理業界の人材紹介エージェントです。
候補者に送るスカウトメールを作成してください。

【企業情報】
{job_info}

【候補者の背景】
{candidate}

**件名:**
**本文:**
（共感→魅力→メリット→アクション誘導の構成で。メールとしてそのまま送れる完成度で）"""
                    result = call_claude(prompt)

            else:  # キャリアパス
                with st.spinner("キャリアパスを生成中..."):
                    prompt = f"""あなたは設備管理・施工管理業界のキャリアコンサルタントです。
候補者に「入社したらこうなれる」と見せるキャリアパスを作成してください。

【企業情報】
{job_info}

【候補者の背景】
{candidate}

### 1年目: ...
### 3年目: ...
### 5年目: ...

| 時期 | 年収 | ポジション |
|------|------|-----------|

**この転職で人生がどう変わるか（一言）:**"""
                    result = call_claude(prompt)

            st.markdown(result)
            with st.expander("コピー用"):
                st.code(result, language=None)

    # ──────────────────────────────────────────
    # 切り返しトーク
    # ──────────────────────────────────────────
    elif tool == "切り返しトーク":
        st.markdown("候補者の懸念・反論をそのまま入力してください。切り返しトークを即生成します。")

        objection = st.text_input(
            "候補者の発言",
            placeholder="例：年収が下がるのはちょっと… / 自分のスキルで通用するか不安 / 今の会社に悪い気がする",
        )

        # 提案中の企業コンテキスト
        matched = st.session_state.get("matched_jobs", None)
        if matched is not None and not matched.empty:
            context_company = st.selectbox("提案中の企業（任意）", ["指定なし"] + matched["企業名"].tolist())
        else:
            context_company = "指定なし"

        if st.button("切り返しを生成", type="primary"):
            if not objection.strip():
                st.warning("候補者の発言を入力してください。")
                return

            company_context = ""
            if context_company != "指定なし":
                jobs_df = load_jobs()
                job_row = jobs_df[jobs_df["企業名"] == context_company]
                if not job_row.empty:
                    row = job_row.iloc[0]
                    company_context = f"\n\n【提案中の企業】\n{row['企業名']}（{row['職種']}）年収{row['年収']}、{row['アピールポイント']}"

            candidate = bg if bg else "（候補者情報なし）"

            with st.spinner("切り返しを考え中..."):
                prompt = f"""あなたは設備管理・施工管理業界の面談で15年以上の経験を持つトップエージェントです。
面談中に候補者から以下の懸念が出ました。即座に使える切り返しトークを作成してください。

【候補者の発言】
「{objection}」

【候補者の背景】
{candidate}{company_context}

以下の形式で回答:

**この懸念の本音:** （表面的な言葉の裏にある本当の不安は何か）

**切り返しトーク:**
（実際に口に出すセリフ。共感→事実→リフレーム の流れで。口語体で）

**追加で聞くべき質問:**
（この懸念を深掘りして、候補者自身に答えを見つけさせる質問を1つ）

**やってはいけないこと:**
（この懸念に対してやりがちだけど逆効果なNG対応）"""
                result = call_claude(prompt)
            st.markdown(result)

    # ──────────────────────────────────────────
    # その場で質問を考える
    # ──────────────────────────────────────────
    elif tool == "その場で質問を考える":
        st.markdown("会話が行き詰まった時、次に聞くべき質問をAIが提案します。")

        situation = st.text_area(
            "今の状況を簡単に",
            height=100,
            placeholder="例：候補者が転職に前向きだが、具体的にどんな会社がいいか言語化できていない",
        )

        purpose = st.radio(
            "目的",
            ["本音を引き出したい", "具体化させたい", "決断を後押ししたい", "話を広げたい"],
            horizontal=True,
        )

        if st.button("質問を提案", type="primary"):
            if not situation.strip():
                st.warning("状況を入力してください。")
                return

            candidate = bg if bg else "（候補者情報なし）"

            with st.spinner("質問を考え中..."):
                prompt = f"""あなたは設備管理・施工管理業界の人材紹介で15年の経験を持つ面談のプロです。
面談中に次の質問が思いつかない状況です。今すぐ使える質問を提案してください。

【候補者の背景】
{candidate}

【今の状況】
{situation}

【目的】
{purpose}

以下の形式で、3つの質問を提案:

**質問1:** 「...」
→ 狙い: ...

**質問2:** 「...」
→ 狙い: ...

**質問3:** 「...」
→ 狙い: ...

※そのまま口に出せる自然な日本語で。「〜ですか？」「〜ってありますか？」など話し言葉で。"""
                result = call_claude(prompt)
            st.markdown(result)
