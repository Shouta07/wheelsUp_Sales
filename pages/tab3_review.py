"""タブ3：録音＆振り返り分析（Whisper文字起こし＋Claudeフィードバック）"""

import streamlit as st
from utils import call_claude, _get_secret


def render() -> None:
    st.header("録音＆振り返り分析")
    st.caption("面談の音声データをアップロードし、文字起こしとフィードバックを自動生成します。")

    uploaded_file = st.file_uploader(
        "面談の音声ファイルをアップロード",
        type=["mp3", "wav", "m4a", "webm", "mp4", "mpeg", "mpga", "oga", "ogg"],
        help="Whisper APIが対応する音声形式をアップロードしてください。",
    )

    if uploaded_file is not None:
        st.audio(uploaded_file, format=f"audio/{uploaded_file.name.split('.')[-1]}")
        st.info(f"ファイル名: {uploaded_file.name}（{uploaded_file.size / 1024:.1f} KB）")

    if st.button("音声を分析", type="primary"):
        if uploaded_file is None:
            st.warning("音声ファイルをアップロードしてください。")
            return

        # ── Whisper API で文字起こし ──
        st.subheader("文字起こし結果")
        with st.spinner("音声をテキストに変換中（Whisper API）..."):
            openai_key = _get_secret("OPENAI_API_KEY")
            if not openai_key:
                st.error("APIキー `OPENAI_API_KEY` が設定されていません。環境変数・`.env`・Streamlit Secrets のいずれかで設定してください。")
                st.stop()

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
            except Exception as e:
                st.error(f"Whisper API エラー: {e}")
                return

        st.text_area("トランスクリプト", transcript_text, height=300)
        st.session_state["transcript"] = transcript_text

        # ── Claude でフィードバック生成 ──
        st.subheader("面談フィードバック")
        with st.spinner("面談の振り返りフィードバックを生成中..."):
            feedback_prompt = f"""あなたは人材紹介業界（特に設備管理・施工管理分野）の面談トレーニングの専門家です。
以下の面談記録（文字起こし）を分析し、エージェントの面談スキルについてフィードバックを提供してください。

【面談記録】
{transcript_text}

以下の4つの観点で詳細にフィードバックしてください。各項目に5段階評価（★）もつけてください。

## 1. 潜在ニーズのヒアリングができていたか？
（候補者の表面的な希望だけでなく、本音や潜在的な転職動機を引き出せていたか）
- 評価: ★☆☆☆☆〜★★★★★
- 良かった点:
- 改善点:

## 2. 設備業界の専門用語の使い方は適切だったか？
（施工管理、サブコン、ゼネコン、発注者側、管工事、電気工事等の用語を正確かつ自然に使えていたか）
- 評価: ★☆☆☆☆〜★★★★★
- 良かった点:
- 改善点:

## 3. 次回接点（ネクストアクション）の確約はスムーズだったか？
（次のステップ（求人紹介、企業面接、追加面談等）を明確に提示し、日程等を確約できていたか）
- 評価: ★☆☆☆☆〜★★★★★
- 良かった点:
- 改善点:

## 4. 改善に向けた具体的なアドバイス
（次回の面談に向けて、すぐに実践できる具体的な改善アクションを3〜5つ提示）

## 総合評価
（総合スコアと一言コメント）"""
            feedback_result = call_claude(feedback_prompt)
        st.markdown(feedback_result)
