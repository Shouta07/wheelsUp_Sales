"""共通ユーティリティ: API クライアント・データ読み込み・セッション管理"""

import hashlib
import logging
import os
import shutil
import time
from datetime import date

import streamlit as st
import pandas as pd
import google.generativeai as genai

# ──────────────────────────────────────────────
# ロギング
# ──────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────
# .env 読み込み（python-dotenv があれば使用）
# ──────────────────────────────────────────────
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# ──────────────────────────────────────────────
# 定数
# ──────────────────────────────────────────────
JOBS_CSV = os.path.join(os.path.dirname(__file__), "jobs.csv")
JOBS_TEMPLATE = os.path.join(os.path.dirname(__file__), "jobs_template.csv")
MEETING_LOG_CSV = os.path.join(os.path.dirname(__file__), "meeting_log.csv")
GEMINI_MODEL = "gemini-2.5-flash-lite"
DAILY_FREE_LIMIT = 1000  # Flash-Lite 無料枠

# バリデーション定数
MAX_INPUT_LENGTH = 5000       # テキスト入力の最大文字数
MAX_CSV_ROWS = 500            # CSVアップロードの最大行数
MAX_CSV_FILE_SIZE = 2 * 1024 * 1024  # 2MB
REQUIRED_JOB_COLS = {"企業名", "職種", "年収", "必須要件", "休日", "アピールポイント"}
OPTIONAL_JOB_COLS = {"紹介数", "成約数", "候補者傾向メモ"}  # 実績カラム（なくても動作する）

# 商談ログカラム
MEETING_LOG_COLS = ["日付", "候補者名", "提案企業", "結果", "候補者の反応メモ", "学び"]


# ──────────────────────────────────────────────
# データ読み込み（キャッシュ無効化対応）
# ──────────────────────────────────────────────
def load_jobs() -> pd.DataFrame:
    """jobs.csv を読み込む。ファイルが存在しない場合はテンプレートから復元する。"""
    if not os.path.exists(JOBS_CSV):
        logger.warning("jobs.csv が見つかりません。テンプレートから復元します。")
        if os.path.exists(JOBS_TEMPLATE):
            shutil.copy2(JOBS_TEMPLATE, JOBS_CSV)
        else:
            # テンプレートもない場合は空のDataFrameを返す
            logger.error("jobs.csv もテンプレートも見つかりません。空のDataFrameを返します。")
            return pd.DataFrame(columns=list(REQUIRED_JOB_COLS))
    try:
        df = pd.read_csv(JOBS_CSV, encoding="utf-8")
        return df
    except Exception as e:
        logger.error(f"jobs.csv の読み込みに失敗しました: {e}")
        return pd.DataFrame(columns=list(REQUIRED_JOB_COLS))


def save_jobs(df: pd.DataFrame) -> None:
    """DataFrame を jobs.csv に保存する。書き込み前にバックアップを作成。"""
    try:
        if os.path.exists(JOBS_CSV):
            shutil.copy2(JOBS_CSV, JOBS_CSV + ".bak")
        df.to_csv(JOBS_CSV, index=False, encoding="utf-8")
        logger.info(f"jobs.csv を保存しました（{len(df)}件）")
    except Exception as e:
        logger.error(f"jobs.csv の保存に失敗しました: {e}")
        raise


# ──────────────────────────────────────────────
# Gemini API
# ──────────────────────────────────────────────
def _get_secret(key: str) -> str:
    """環境変数 → Streamlit secrets の順に探す。"""
    val = os.environ.get(key, "")
    if not val:
        val = st.secrets.get(key, "")
    return val


def _configure_gemini() -> None:
    api_key = _get_secret("GEMINI_API_KEY")
    if not api_key:
        st.error("APIキー `GEMINI_API_KEY` が設定されていません。環境変数・`.env`・Streamlit Secrets のいずれかで設定してください。")
        st.stop()
    genai.configure(api_key=api_key)


def _get_usage() -> dict:
    """本日のAPI使用回数を取得。日付が変わったらリセット。"""
    today = date.today().isoformat()
    if "api_usage_date" not in st.session_state or st.session_state["api_usage_date"] != today:
        st.session_state["api_usage_date"] = today
        st.session_state["api_usage_count"] = 0
    return {"date": today, "count": st.session_state["api_usage_count"]}


def _increment_usage() -> None:
    _get_usage()  # 日付リセットを確認
    st.session_state["api_usage_count"] = st.session_state.get("api_usage_count", 0) + 1


def get_usage_display() -> str:
    """サイドバー表示用の使用状況文字列。"""
    usage = _get_usage()
    remaining = DAILY_FREE_LIMIT - usage["count"]
    return f"{usage['count']} / {DAILY_FREE_LIMIT} 回（残り {remaining} 回）"


def _cache_key(prompt: str, system: str) -> str:
    """プロンプトからキャッシュキーを生成。"""
    return hashlib.md5((prompt + system).encode()).hexdigest()


def call_claude(prompt: str, system: str = "", max_tokens: int = 4096, use_cache: bool = True) -> str:
    """Gemini API を呼び出す（関数名は後方互換のため維持）。キャッシュ・リトライ付き。"""
    # キャッシュ確認（同一プロンプトの再生成を防止）
    cache_k = _cache_key(prompt, system)
    if use_cache:
        cached = st.session_state.get(f"_cache_{cache_k}")
        if cached:
            return cached

    _configure_gemini()
    model = genai.GenerativeModel(
        model_name=GEMINI_MODEL,
        system_instruction=system if system else None,
    )
    config = genai.types.GenerationConfig(max_output_tokens=max_tokens)

    max_retries = 4
    for attempt in range(max_retries):
        try:
            response = model.generate_content(prompt, generation_config=config)
            _increment_usage()
            result = response.text
            # キャッシュに保存
            st.session_state[f"_cache_{cache_k}"] = result
            return result
        except Exception as e:
            err_str = str(e)
            logger.warning(f"Gemini API エラー (attempt {attempt + 1}/{max_retries}): {err_str}")
            if "429" in err_str and attempt < max_retries - 1:
                wait = 2 ** (attempt + 1)  # 2, 4, 8, 16秒
                st.toast(f"レート制限中… {wait}秒後にリトライします（{attempt + 1}/{max_retries}）")
                time.sleep(wait)
                continue
            return f"**[エラー]** Gemini API エラー: {e}"


# ──────────────────────────────────────────────
# セッション管理
# ──────────────────────────────────────────────
def init_session_state() -> None:
    """session_state のデフォルト値を一括初期化する。"""
    defaults = {
        "candidate_info": "",
        "matched_jobs": None,
        "transcript": "",
    }
    for key, value in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = value


def get_candidate_info() -> str:
    return st.session_state.get("candidate_info", "")


def set_candidate_info(text: str) -> None:
    st.session_state["candidate_info"] = text


# ──────────────────────────────────────────────
# 商談ログ（学習データ蓄積）
# ──────────────────────────────────────────────
def load_meeting_log() -> pd.DataFrame:
    """商談ログを読み込む。存在しない場合は空のDataFrameを返す。"""
    if os.path.exists(MEETING_LOG_CSV):
        try:
            return pd.read_csv(MEETING_LOG_CSV, encoding="utf-8")
        except Exception as e:
            logger.error(f"meeting_log.csv の読み込みに失敗: {e}")
    return pd.DataFrame(columns=MEETING_LOG_COLS)


def save_meeting_log(df: pd.DataFrame) -> None:
    """商談ログを保存する。"""
    try:
        df.to_csv(MEETING_LOG_CSV, index=False, encoding="utf-8")
        logger.info(f"meeting_log.csv を保存しました（{len(df)}件）")
    except Exception as e:
        logger.error(f"meeting_log.csv の保存に失敗: {e}")
        raise


def add_meeting_log_entry(candidate_name: str, proposed_companies: str,
                          result: str, reaction_memo: str, learning: str) -> None:
    """商談ログに1件追加し、結果に応じて求人データの実績を更新する。"""
    log_df = load_meeting_log()
    new_row = pd.DataFrame([{
        "日付": date.today().isoformat(),
        "候補者名": candidate_name,
        "提案企業": proposed_companies,
        "結果": result,
        "候補者の反応メモ": reaction_memo,
        "学び": learning,
    }])
    log_df = pd.concat([log_df, new_row], ignore_index=True)
    save_meeting_log(log_df)

    # 求人データの紹介数・成約数を更新
    jobs_df = load_jobs()
    companies = [c.strip() for c in proposed_companies.replace("、", ",").split(",") if c.strip()]
    for company in companies:
        mask = jobs_df["企業名"] == company
        if mask.any():
            jobs_df.loc[mask, "紹介数"] = jobs_df.loc[mask, "紹介数"].fillna(0).astype(int) + 1
            if result == "成約":
                jobs_df.loc[mask, "成約数"] = jobs_df.loc[mask, "成約数"].fillna(0).astype(int) + 1
    save_jobs(jobs_df)


def build_performance_context(jobs_df: pd.DataFrame) -> str:
    """求人データの実績をプロンプト注入用のテキストに変換する。"""
    # 実績カラムがない場合は空文字を返す
    if "紹介数" not in jobs_df.columns:
        return ""

    has_data = jobs_df[jobs_df["紹介数"].fillna(0).astype(int) > 0]
    if has_data.empty:
        return ""

    lines = ["【過去の紹介実績データ（この情報を根拠にマッチング精度を上げてください）】"]
    for _, row in has_data.iterrows():
        refs = int(row.get("紹介数", 0))
        wins = int(row.get("成約数", 0))
        rate = f"{wins / refs * 100:.0f}%" if refs > 0 else "0%"
        memo = row.get("候補者傾向メモ", "")
        line = f"- {row['企業名']}: 紹介{refs}件, 成約{wins}件（成約率{rate}）"
        if pd.notna(memo) and str(memo).strip():
            line += f" ※{memo}"
        lines.append(line)

    # 商談ログから学びのサマリーも追加
    log_df = load_meeting_log()
    if not log_df.empty:
        recent = log_df.tail(10)  # 直近10件
        learnings = [l for l in recent["学び"].dropna() if str(l).strip()]
        if learnings:
            lines.append("\n【直近の商談からの学び】")
            for l in learnings[-5:]:  # 直近5件の学び
                lines.append(f"- {l}")

    return "\n".join(lines)


# ──────────────────────────────────────────────
# 入力バリデーション
# ──────────────────────────────────────────────
def validate_text_input(text: str, field_name: str = "入力", max_length: int = MAX_INPUT_LENGTH) -> tuple[bool, str]:
    """テキスト入力を検証する。(有効かどうか, エラーメッセージ) を返す。"""
    if not text or not text.strip():
        return False, f"{field_name}を入力してください。"
    if len(text) > max_length:
        return False, f"{field_name}は{max_length}文字以内で入力してください（現在{len(text)}文字）。"
    return True, ""


def validate_csv_upload(uploaded_file) -> tuple[bool, str, pd.DataFrame | None]:
    """アップロードされたCSVを検証する。(有効かどうか, エラーメッセージ, DataFrame) を返す。"""
    if uploaded_file is None:
        return False, "ファイルが選択されていません。", None

    # ファイルサイズチェック
    uploaded_file.seek(0, 2)  # 末尾に移動
    file_size = uploaded_file.tell()
    uploaded_file.seek(0)  # 先頭に戻す

    if file_size > MAX_CSV_FILE_SIZE:
        size_mb = file_size / (1024 * 1024)
        return False, f"ファイルサイズが大きすぎます（{size_mb:.1f}MB）。{MAX_CSV_FILE_SIZE // (1024 * 1024)}MB以内にしてください。", None

    try:
        df = pd.read_csv(uploaded_file, encoding="utf-8")
    except Exception as e:
        return False, f"CSVの読み込みに失敗しました: {e}", None

    # 必須カラムチェック
    if not REQUIRED_JOB_COLS.issubset(set(df.columns)):
        missing = REQUIRED_JOB_COLS - set(df.columns)
        return False, f"必須カラムが不足しています: {missing}", None

    # 行数チェック
    if len(df) > MAX_CSV_ROWS:
        return False, f"行数が多すぎます（{len(df)}行）。{MAX_CSV_ROWS}行以内にしてください。", None

    # 空の企業名チェック
    if df["企業名"].isna().any() or (df["企業名"].astype(str).str.strip() == "").any():
        return False, "企業名が空の行があります。すべての行に企業名を入力してください。", None

    return True, "", df
