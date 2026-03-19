"""共通ユーティリティ: API クライアント・データ読み込み・セッション管理"""

import os
import time

import streamlit as st
import pandas as pd
import google.generativeai as genai

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
GEMINI_MODEL = "gemini-2.5-flash"


# ──────────────────────────────────────────────
# データ読み込み（キャッシュ無効化対応）
# ──────────────────────────────────────────────
def load_jobs() -> pd.DataFrame:
    """jobs.csv を読み込む。編集後にも最新データを返す。"""
    return pd.read_csv(JOBS_CSV)


def save_jobs(df: pd.DataFrame) -> None:
    """DataFrame を jobs.csv に保存する。"""
    df.to_csv(JOBS_CSV, index=False)


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


def call_claude(prompt: str, system: str = "", max_tokens: int = 4096) -> str:
    """Gemini API を呼び出す（関数名は後方互換のため維持）。429時は自動リトライ。"""
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
            return response.text
        except Exception as e:
            err_str = str(e)
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
