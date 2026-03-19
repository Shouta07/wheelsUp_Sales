"""商談後 — フォロー（振り返り＋フォローコンテンツ一括生成）"""

import os
import streamlit as st
from utils import call_claude, get_candidate_info, _get_secret


def render() -> None:
    st.header("商談後 — フォロー")
    st.caption("面談メモを入力するだけで、振り返り・フォローメール・推薦文・次回準備が一括生成されます。")

    bg = get_candidate_info()

    # ── 入力 ──
    input_mode = st.radio(
        "面談内容の入力",
        ["メモを入力", "音声をアップロード"],
        horizontal=True,
    )

    transcript_text = ""

    if input_mode == "メモを入力":
        transcript_text = st.text_area(
            "面談の内容・やりとりのメモ",
            height=250,
            value=st.session_state.get("transcript", ""),
            placeholder=(
                "例：\n"
                "・サブコン空調施工管理5年目、残業80h/月が最大の悩み\n"
                "・年収450万→500万以上希望\n"
                "・NTTファシリティーズに強い興味（安定性に惹かれた）\n"
                "・三井不動産は「自分にはハードル高い」と消極的\n"
                "・「施工管理しかやったことないから不安」を繰り返し言っていた\n"
                "・来週水曜に職務経歴書を送る約束"
            ),
        )
    else:
        uploaded_file = st.file_uploader(
            "音声ファイル",
            type=["mp3", "wav", "m4a", "webm", "mp4", "mpeg", "mpga", "oga", "ogg"],
        )
        if uploaded_file is not None:
            st.audio(uploaded_file, format=f"audio/{uploaded_file.name.split('.')[-1]}")
            if st.button("文字起こし"):
                openai_key = _get_secret("OPENAI_API_KEY")
                if not openai_key:
                    st.error("`OPENAI_API_KEY` が設定されていません。")
                    return
                with st.spinner("Whisper APIで文字起こし中..."):
                    try:
                        from openai import OpenAI
                        client = OpenAI(api_key=openai_key)
                        uploaded_file.seek(0)
                        result = client.audio.transcriptions.create(
                            model="whisper-1",
                            file=(uploaded_file.name, uploaded_file.read(), f"audio/{uploaded_file.name.split('.')[-1]}"),
                            language="ja",
                        )
                        transcript_text = result.text
                        st.session_state["transcript"] = transcript_text
                    except Exception as e:
                        st.error(f"Whisper API エラー: {e}")
                        return
                st.text_area("文字起こし結果", transcript_text, height=200)

        if not transcript_text and st.session_state.get("transcript"):
            transcript_text = st.session_state["transcript"]
            st.text_area("前回の文字起こし結果", transcript_text, height=200)

    # ── 提案した企業（フォローメール・推薦文に使用）──
    proposed_companies = st.text_input(
        "提案した企業名（カンマ区切り）",
        placeholder="例：NTTファシリティーズ, 三井不動産",
    )

    # ── 生成対象の選択 ──
    gen_items = st.multiselect(
        "生成する内容",
        [
            "面談の振り返りフィードバック",
            "候補者へのフォローメール",
            "企業への推薦文",
            "次回面談の質問リスト",
        ],
        default=[
            "面談の振り返りフィードバック",
            "候補者へのフォローメール",
        ],
    )

    if st.button("一括生成", type="primary", use_container_width=True):
        if not transcript_text.strip():
            st.warning("面談内容を入力してください。")
            return

        st.session_state["transcript"] = transcript_text
        candidate = bg if bg else "（事前情報なし）"

        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # 振り返りフィードバック
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        if "面談の振り返りフィードバック" in gen_items:
            st.divider()
            st.subheader("面談の振り返り")
            with st.spinner("面談を分析中..."):
                prompt = f"""あなたは設備管理・施工管理分野の人材紹介で15年の経験を持つ面談トレーナーです。
以下の面談記録を分析してください。

【候補者の背景】
{candidate}

【面談記録】
{transcript_text}

以下の形式でフィードバック:

## 総合: ○○/100点

## よくできたこと
（具体的に2-3個）

## もったいなかったこと
（具体的に2-3個。「こう言えばもっとよかった」を含めて）

## 候補者の温度感
（この候補者は今どの段階か。転職意欲を10段階で評価し、根拠を）

## 今すぐやるべきこと TOP3
| 優先度 | アクション | 理由 |
|--------|-----------|------|
| 1 | ... | ... |
| 2 | ... | ... |
| 3 | ... | ... |"""
                result = call_claude(prompt)
            st.markdown(result)
            with st.expander("コピー用"):
                st.code(result, language=None)

        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # フォローメール
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        if "候補者へのフォローメール" in gen_items:
            st.divider()
            st.subheader("候補者へのフォローメール")
            with st.spinner("フォローメールを生成中..."):
                companies_context = f"\n提案した企業: {proposed_companies}" if proposed_companies.strip() else ""
                prompt = f"""あなたは設備管理・施工管理業界の人材紹介エージェントです。
面談直後に候補者に送るフォローメールを作成してください。

【候補者の背景】
{candidate}

【面談の内容】
{transcript_text}{companies_context}

以下の2パターンを作成:

## パターン1: 候補者が前向きだった場合
**件名:**
**本文:**
（お礼→面談で話した内容の要約→提案企業の魅力を改めて→具体的な次のステップと期限）

## パターン2: 候補者が迷っている・慎重だった場合
**件名:**
**本文:**
（お礼→候補者の不安への共感→面談で気づいた候補者の強み→プレッシャーなく次の一歩を促す）

※メールとしてそのまま送れる完成度で。候補者が「この人に任せたい」と感じるトーンで。"""
                result = call_claude(prompt)
            st.markdown(result)
            with st.expander("コピー用"):
                st.code(result, language=None)

        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # 企業への推薦文
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        if "企業への推薦文" in gen_items:
            st.divider()
            st.subheader("企業への推薦文")

            if not proposed_companies.strip():
                st.warning("「提案した企業名」を入力すると、企業ごとの推薦文を生成します。")
            else:
                from utils import load_jobs
                jobs_df = load_jobs()

                for company_name in [c.strip() for c in proposed_companies.replace("、", ",").split(",") if c.strip()]:
                    with st.spinner(f"{company_name}への推薦文を生成中..."):
                        job_row = jobs_df[jobs_df["企業名"] == company_name]
                        if not job_row.empty:
                            row = job_row.iloc[0]
                            job_info = (
                                f"企業名: {row['企業名']}\n職種: {row['職種']}\n年収: {row['年収']}\n"
                                f"必須要件: {row['必須要件']}\nアピールポイント: {row['アピールポイント']}"
                            )
                        else:
                            job_info = f"企業名: {company_name}（求人DB外・業界知識で補完）"

                        prompt = f"""あなたは設備管理・施工管理業界の人材紹介エージェントです。
以下の候補者を企業に推薦する文書を作成してください。

【推薦先企業】
{job_info}

【候補者の背景】
{candidate}

【面談での印象】
{transcript_text}

## {company_name}御中 — 候補者推薦書

**候補者概要:** （2文で強みを端的に）

**推薦理由:**
1. （この企業に合う理由）
2. （この企業に合う理由）
3. （この企業に合う理由）

**面談での印象:**
（人柄・コミュニケーション力・転職への本気度が伝わるように）

**候補者の志望動機:**
（候補者自身の言葉を活かして）

**補足事項:**
（年収・入社時期・その他企業に伝えるべき条件）

※企業の採用担当が「この人に会いたい」と思える内容で。"""
                        result = call_claude(prompt)
                    st.markdown(f"### {company_name}")
                    st.markdown(result)
                    with st.expander(f"{company_name} — コピー用"):
                        st.code(result, language=None)

        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # 次回面談の質問リスト
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        if "次回面談の質問リスト" in gen_items:
            st.divider()
            st.subheader("次回面談の質問リスト")
            with st.spinner("次回用の質問を生成中..."):
                prompt = f"""あなたは設備管理・施工管理業界の人材紹介で15年の経験を持つ面談のプロです。
前回の面談内容を踏まえ、次回の面談で聞くべき質問を作成してください。

【候補者の背景】
{candidate}

【前回の面談内容】
{transcript_text}

## 前回の積み残し（必ず確認）
（前回深掘りできなかった・曖昧だった点）
1. 「...」 → 狙い: ...
2. 「...」 → 狙い: ...

## 本音を引き出す質問
（まだ言語化できていない希望や不安を引き出す）
1. 「...」 → 狙い: ...
2. 「...」 → 狙い: ...

## 決断を後押しする質問
（候補者が前に進めるように）
1. 「...」 → 狙い: ...
2. 「...」 → 狙い: ...

※「」内はそのまま話せる自然な日本語で。"""
                result = call_claude(prompt)
            st.markdown(result)
            with st.expander("コピー用"):
                st.code(result, language=None)
