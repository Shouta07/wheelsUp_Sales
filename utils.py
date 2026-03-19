"""共通ユーティリティ: API クライアント・データ読み込み・セッション管理"""

import os
import json
import re

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
def get_anthropic_client() -> Anthropic:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        st.error("環境変数 `ANTHROPIC_API_KEY` が設定されていません。`.env` ファイルまたは環境変数で設定してください。")
        st.stop()
    return Anthropic(api_key=api_key)


def call_claude(prompt: str, system: str = "") -> str:
    """Claude API を呼び出す。エラー時は分かりやすいメッセージを返す。"""
    try:
        client = get_anthropic_client()
        kwargs = dict(
            model=CLAUDE_MODEL,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )
        if system:
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


# ──────────────────────────────────────────────
# キーワード解析ヘルパー
# ──────────────────────────────────────────────
def extract_keywords(raw_text: str) -> list[str]:
    """Claude の返答からキーワードリストを抽出する。"""
    try:
        data = json.loads(raw_text)
        return data.get("keywords", [])
    except json.JSONDecodeError:
        return re.findall(r'"([^"]+)"', raw_text)
