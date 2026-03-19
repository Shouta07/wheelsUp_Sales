"""共通ユーティリティ: API クライアント・データ読み込み・セッション管理"""

import os

import streamlit as st
import pandas as pd
from anthropic import Anthropic, APIError, APIConnectionError

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
CLAUDE_MODEL = "claude-haiku-4-5-20251001"


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
# Anthropic API
# ──────────────────────────────────────────────
def _get_secret(key: str) -> str:
    """環境変数 → Streamlit secrets の順に探す。"""
    val = os.environ.get(key, "")
    if not val:
        val = st.secrets.get(key, "")
    return val


def get_anthropic_client() -> Anthropic:
    api_key = _get_secret("ANTHROPIC_API_KEY")
    if not api_key:
        st.error("APIキー `ANTHROPIC_API_KEY` が設定されていません。環境変数・`.env`・Streamlit Secrets のいずれかで設定してください。")
        st.stop()
    return Anthropic(api_key=api_key)


def call_claude(prompt: str, system: str = "", max_tokens: int = 4096) -> str:
    """Claude API を呼び出す。長いプロンプトは自動的にPrompt Cachingを活用。"""
    try:
        client = get_anthropic_client()

        # 長いプロンプト（求人CSV等を含む場合）は Prompt Caching を活用
        use_cache = len(prompt) > 2000
        if use_cache:
            messages = [{"role": "user", "content": [
                {"type": "text", "text": prompt, "cache_control": {"type": "ephemeral"}},
            ]}]
        else:
            messages = [{"role": "user", "content": prompt}]

        kwargs = dict(
            model=CLAUDE_MODEL,
            max_tokens=max_tokens,
            messages=messages,
        )
        if system:
            if use_cache:
                kwargs["system"] = [
                    {"type": "text", "text": system, "cache_control": {"type": "ephemeral"}},
                ]
            else:
                kwargs["system"] = system
        response = client.messages.create(**kwargs)
        return response.content[0].text
    except APIConnectionError:
        return "**[エラー]** Anthropic API に接続できません。ネットワーク接続を確認してください。"
    except APIError as e:
        return f"**[エラー]** Anthropic API エラー（{e.status_code}）: {e.message}"
    except Exception as e:
        return f"**[エラー]** 予期しないエラーが発生しました: {e}"


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
