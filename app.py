"""
商談サポートアプリ — 候補者に最高の体験を提供する
人材紹介エージェント向け：商談前・商談中・商談後
"""

import streamlit as st
from utils import init_session_state, get_usage_display
from tabs import tab_before, tab_during, tab_after, tab4_jobs

# ──────────────────────────────────────────────
# ページ設定 & セッション初期化
# ──────────────────────────────────────────────
st.set_page_config(page_title="商談サポート", page_icon="🏗️", layout="wide")
init_session_state()

# ──────────────────────────────────────────────
# サイドバー
# ──────────────────────────────────────────────
st.sidebar.title("商談サポート")
st.sidebar.caption("候補者に最高の体験を。")
st.sidebar.metric("本日のAPI使用量", get_usage_display())

page = st.sidebar.radio(
    "フェーズ",
    [
        "商談前 — 準備",
        "商談中 — 実戦",
        "商談後 — フォロー",
        "求人DB管理",
    ],
)

# ──────────────────────────────────────────────
# ページルーティング
# ──────────────────────────────────────────────
if page == "商談前 — 準備":
    tab_before.render()
elif page == "商談中 — 実戦":
    tab_during.render()
elif page == "商談後 — フォロー":
    tab_after.render()
elif page == "求人DB管理":
    tab4_jobs.render()
