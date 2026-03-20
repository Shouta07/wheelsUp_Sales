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
GEMINI_MODEL = "gemini-2.5-flash-lite"
DAILY_FREE_LIMIT = 1000  # Flash-Lite 無料枠

# バリデーション定数
MAX_INPUT_LENGTH = 5000       # テキスト入力の最大文字数
MAX_CSV_ROWS = 500            # CSVアップロードの最大行数
MAX_CSV_FILE_SIZE = 2 * 1024 * 1024  # 2MB
REQUIRED_JOB_COLS = {"企業名", "職種", "年収", "必須要件", "休日", "アピールポイント"}


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
