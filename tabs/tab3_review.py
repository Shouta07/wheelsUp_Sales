"""タブ3：面談振り返り分析（テキスト入力 or 音声文字起こし → AIフィードバック）"""

import os
import streamlit as st
from utils import call_claude, _get_secret


def render() -> None:
    st.header("面談振り返り分析")
    st.caption("面談の内容を入力（またはアップロード）して、AIがスキル分析と改善アクションを提案します。")

    # 入力方式の選択
    input_mode = st.radio(
        "面談内容の入力方式",
        ["テキストで入力", "音声ファイルをアップロード"],
        horizontal=True,
    )

    transcript_text = ""

    if input_mode == "テキストで入力":
        transcript_text = st.text_area(
            "面談の内容・メモを入力",
            height=300,
            value=st.session_state.get("transcript", ""),
            placeholder=(
                "面談の流れや会話の要点を入力してください。\n\n"
                "例：\n"
                "・候補者は現在サブコンで空調施工管理5年目\n"
                "・残業月80h、土日出勤が多く家族との時間が取れないのが最大の悩み\n"
                "・年収は現在450万、500万以上を希望\n"
                "・発注者側に興味があるが、自分のスキルが通用するか不安\n"
                "・三井不動産とNTTファシリティーズを提案→興味あり\n"
                "・来週中に職務経歴書を送ってもらう約束"
            ),
        )

    else:
        uploaded_file = st.file_uploader(
            "面談の音声ファイルをアップロード",
            type=["mp3", "wav", "m4a", "webm", "mp4", "mpeg", "mpga", "oga", "ogg"],
            help="Whisper APIが対応する音声形式をアップロードしてください。",
        )

        if uploaded_file is not None:
            st.audio(uploaded_file, format=f"audio/{uploaded_file.name.split('.')[-1]}")
            st.info(f"ファイル名: {uploaded_file.name}（{uploaded_file.size / 1024:.1f} KB）")

            if st.button("音声を文字起こし"):
                with st.spinner("音声をテキストに変換中（Whisper API）..."):
                    openai_key = _get_secret("OPENAI_API_KEY")
                    if not openai_key:
                        st.error("`OPENAI_API_KEY` が設定されていません。環境変数・`.env`・Streamlit Secrets のいずれかで設定してください。")
                        return

                    try:
                        from openai import OpenAI
                        openai_client = OpenAI(api_key=openai_key)
                        uploaded_file.seek(0)
                        transcript = openai_client.audio.transcriptions.create(
                            model="whisper-1",
                            file=(uploaded_file.name, uploaded_file.read(), f"audio/{uploaded_file.name.split('.')[-1]}"),
                            language="ja",
                        )
                        transcript_text = transcript.text
                        st.session_state["transcript"] = transcript_text
                    except Exception as e:
                        st.error(f"Whisper API エラー: {e}")
                        return

                st.text_area("文字起こし結果", transcript_text, height=300)

        # セッションから前回の文字起こしを復元
        if not transcript_text and st.session_state.get("transcript"):
            transcript_text = st.session_state["transcript"]
            st.text_area("前回の文字起こし結果", transcript_text, height=300)

    # ── 分析実行 ──
    if st.button("面談を分析", type="primary"):
        if not transcript_text.strip():
            st.warning("面談内容を入力するか、音声ファイルを文字起こししてください。")
            return

        st.session_state["transcript"] = transcript_text

        # ── フィードバック生成 ──
        st.subheader("面談フィードバック")
        with st.spinner("面談を分析中..."):
            feedback_prompt = f"""あなたは人材紹介業界（特に設備管理・施工管理分野）で15年以上の経験を持つ面談トレーニングの専門家です。
以下の面談記録を分析し、エージェントの面談スキルについて実践的なフィードバックを提供してください。

【面談記録】
{transcript_text}

以下の形式でフィードバックしてください:

## 総合スコア: X / 100点

## 1. 潜在ニーズの引き出し（★☆☆☆☆〜★★★★★）
**できていたこと:**
**改善ポイント:**
**具体的な質問例:** （次回使える質問を2-3個）

## 2. 業界知識の活用（★☆☆☆☆〜★★★★★）
**できていたこと:**
**改善ポイント:**
**使うべきだったキーワード・トーク:**

## 3. 企業提案の説得力（★☆☆☆☆〜★★★★★）
**できていたこと:**
**改善ポイント:**
**より効果的な提案の仕方:**

## 4. ネクストアクションの確約（★☆☆☆☆〜★★★★★）
**できていたこと:**
**改善ポイント:**
**使えるクロージングフレーズ:**

## 今すぐ実践できる改善アクション TOP3
（明日の面談から使える具体的なアクションを3つ、優先度順に）

| 優先度 | アクション | 期待効果 |
|--------|-----------|---------|
| 1 | ... | ... |
| 2 | ... | ... |
| 3 | ... | ... |

## この候補者のフォローアップ提案
（この面談の内容を踏まえ、次回の面談や候補者へのフォローで何をすべきか）"""
            feedback_result = call_claude(feedback_prompt)
        st.markdown(feedback_result)

        # コピー用
        with st.expander("フィードバック全文（コピー用）"):
            st.code(feedback_result, language=None)

        # ── 次回面談の質問リスト ──
        st.divider()
        st.subheader("次回面談で使える質問リスト")
        with st.spinner("質問リストを生成中..."):
            question_prompt = f"""あなたは人材紹介業界（設備管理・施工管理分野）の面談トレーニング専門家です。
以下の面談記録を踏まえて、次回の面談で候補者に聞くべき質問リストを作成してください。

【前回の面談記録】
{transcript_text}

以下の形式で出力してください:

## 必ず確認すべき質問（前回の積み残し）
（前回の面談で深掘りできなかった点、曖昧だった点を掘り下げる質問）
1. 「〜〜」 → 狙い: 〇〇を明確にする
2. ...

## 候補者の本音を引き出す質問
（転職の本当の動機や、言語化できていない希望を引き出す質問）
1. 「〜〜」 → 狙い: 〇〇
2. ...

## 決断を後押しする質問
（候補者が前に進めるように、具体的なイメージを持たせる質問）
1. 「〜〜」 → 狙い: 〇〇
2. ...

各質問は「」で囲み、実際にそのまま話せる自然な日本語で書いてください。"""
            question_result = call_claude(question_prompt)
        st.markdown(question_result)
        with st.expander("質問リスト（コピー用）"):
            st.code(question_result, language=None)
