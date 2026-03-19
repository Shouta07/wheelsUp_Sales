"""
オールインワン面談サポートアプリ
人材紹介エージェント向け：事前準備・面談サポート・振り返り分析
"""

import os
import streamlit as st
import pandas as pd
from anthropic import Anthropic
from openai import OpenAI

# ──────────────────────────────────────────────
# 初期設定
# ──────────────────────────────────────────────
st.set_page_config(page_title="面談サポートアプリ", page_icon="🏗️", layout="wide")

JOBS_CSV = os.path.join(os.path.dirname(__file__), "jobs.csv")


@st.cache_data
def load_jobs() -> pd.DataFrame:
    return pd.read_csv(JOBS_CSV)


def get_anthropic_client() -> Anthropic:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        st.error("環境変数 ANTHROPIC_API_KEY が設定されていません。")
        st.stop()
    return Anthropic(api_key=api_key)


def call_claude(prompt: str, system: str = "") -> str:
    client = get_anthropic_client()
    messages = [{"role": "user", "content": prompt}]
    kwargs = dict(
        model="claude-3-haiku-20240307",
        max_tokens=2048,
        messages=messages,
    )
    if system:
        kwargs["system"] = system
    response = client.messages.create(**kwargs)
    return response.content[0].text


# ──────────────────────────────────────────────
# サイドバーでページ切替
# ──────────────────────────────────────────────
st.sidebar.title("面談サポートアプリ")
page = st.sidebar.radio(
    "ページを選択",
    ["1. 事前準備＆マッチング", "2. 面談サポート", "3. 録音＆振り返り分析"],
)

# ══════════════════════════════════════════════
# タブ1：事前準備＆マッチング
# ══════════════════════════════════════════════
if page == "1. 事前準備＆マッチング":
    st.header("事前準備＆マッチング")
    st.caption("候補者の情報を入力し、内部DBからの求人検索と外部アタックリストの提案を行います。")

    candidate_info = st.text_area(
        "候補者の事前情報を入力してください",
        height=200,
        placeholder=(
            "例：\n"
            "年齢：32歳\n"
            "現職：サブコン（空調設備施工管理）5年目\n"
            "悩み：激務で残業月80h、土日出勤が多い\n"
            "希望条件：年収500万以上、土日休み、発注者側やデベロッパーに興味\n"
            "資格：1級管工事施工管理技士"
        ),
    )

    if st.button("内部DBから検索＆外部レコメンド", type="primary"):
        if not candidate_info.strip():
            st.warning("候補者情報を入力してください。")
        else:
            jobs_df = load_jobs()

            # ── Claude で候補者情報を解析し検索キーワードを抽出 ──
            with st.spinner("候補者情報を解析中..."):
                parse_prompt = f"""以下の候補者情報から、求人検索に使うキーワードを抽出してJSON形式で返してください。
キーワードは求人CSVの「職種」「必須要件」「休日」「年収」「アピールポイント」カラムと照合します。
該当しそうな語句を幅広くリストアップしてください。

候補者情報:
{candidate_info}

以下のJSON形式で返答してください（他の文章は不要）:
{{"keywords": ["キーワード1", "キーワード2", ...]}}"""
                keywords_raw = call_claude(parse_prompt)

            # キーワード抽出
            import json
            try:
                kw_data = json.loads(keywords_raw)
                keywords = kw_data.get("keywords", [])
            except json.JSONDecodeError:
                import re
                keywords = re.findall(r'"([^"]+)"', keywords_raw)

            # ── 内部DB検索（キーワードOR検索） ──
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

            # session_state に保存（タブ2で使用）
            st.session_state["matched_jobs"] = matched if not matched.empty else jobs_df

            # ── 外部アタックリスト提案（Claude API） ──
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

# ══════════════════════════════════════════════
# タブ2：面談サポート（提案・キャリアパス提示）
# ══════════════════════════════════════════════
elif page == "2. 面談サポート":
    st.header("面談サポート（提案文面＆キャリアパス生成）")
    st.caption("求人を選択して、候補者への提案文面とキャリアパスを生成します。")

    # マッチ済み求人があれば選択肢に表示
    matched = st.session_state.get("matched_jobs", None)
    if matched is not None and not matched.empty:
        company_options = matched["企業名"].tolist()
    else:
        jobs_df = load_jobs()
        company_options = jobs_df["企業名"].tolist()

    col1, col2 = st.columns([3, 1])
    with col1:
        selected_company = st.selectbox("提案する企業を選択", company_options)
    with col2:
        custom_company = st.text_input("または企業名を入力")

    target_company = custom_company.strip() if custom_company.strip() else selected_company

    candidate_context = st.text_area(
        "候補者の背景（タブ1で入力した内容をコピーまたは要約）",
        height=120,
        placeholder="例：サブコン空調施工管理5年、激務に疲弊、発注者側希望、年収500万以上",
    )

    if st.button("提案を生成", type="primary"):
        if not target_company:
            st.warning("企業名を選択または入力してください。")
        else:
            # 求人情報を取得
            jobs_df = load_jobs()
            job_row = jobs_df[jobs_df["企業名"] == target_company]
            job_detail = ""
            if not job_row.empty:
                row = job_row.iloc[0]
                job_detail = f"""
企業名: {row['企業名']}
職種: {row['職種']}
年収: {row['年収']}
必須要件: {row['必須要件']}
休日: {row['休日']}
アピールポイント: {row['アピールポイント']}"""

            # ── 提案文面の生成 ──
            st.subheader("提案文面（スカウトメール / トークスクリプト）")
            with st.spinner("提案文面を生成中..."):
                proposal_prompt = f"""あなたは設備管理・施工管理業界に特化した人材紹介エージェントです。
以下の情報をもとに、候補者に対する魅力的な提案文面を2種類作成してください。

【ターゲット企業情報】
{job_detail if job_detail else f"企業名: {target_company}（詳細情報なし・一般的な業界知識で補完）"}

【候補者の背景】
{candidate_context if candidate_context else "（詳細不明）"}

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

            # ── キャリアパスの生成 ──
            st.subheader("入社後のキャリアパス（3〜5年後）")
            with st.spinner("キャリアパスを生成中..."):
                career_prompt = f"""あなたは設備管理・施工管理業界のキャリアコンサルタントです。
以下の企業に入社した場合の、3〜5年後までのキャリアパスを分かりやすく図解してください。

【企業情報】
{job_detail if job_detail else f"企業名: {target_company}"}

【候補者の背景】
{candidate_context if candidate_context else "（詳細不明）"}

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

# ══════════════════════════════════════════════
# タブ3：録音＆振り返り分析
# ══════════════════════════════════════════════
elif page == "3. 録音＆振り返り分析":
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
        else:
            # ── Whisper APIで文字起こし ──
            st.subheader("文字起こし結果")
            with st.spinner("音声をテキストに変換中（Whisper API）..."):
                openai_key = os.environ.get("OPENAI_API_KEY", "")
                if not openai_key:
                    st.error("環境変数 OPENAI_API_KEY が設定されていません。")
                    st.stop()

                openai_client = OpenAI(api_key=openai_key)
                uploaded_file.seek(0)
                transcript = openai_client.audio.transcriptions.create(
                    model="whisper-1",
                    file=(uploaded_file.name, uploaded_file.read(), f"audio/{uploaded_file.name.split('.')[-1]}"),
                    language="ja",
                )
                transcript_text = transcript.text

            st.text_area("トランスクリプト", transcript_text, height=300)
            st.session_state["transcript"] = transcript_text

            # ── Claude APIでフィードバック生成 ──
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
