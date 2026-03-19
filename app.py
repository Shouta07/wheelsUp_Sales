"""
オールインワン面談サポートアプリ
人材紹介エージェント向け：事前準備・面談サポート・振り返り分析
"""

import streamlit as st
from utils import init_session_state
from pages import tab1_matching, tab2_support, tab3_review, tab4_jobs, tab5_candidates

# ──────────────────────────────────────────────
# ページ設定 & セッション初期化
# ──────────────────────────────────────────────
st.set_page_config(page_title="面談サポートアプリ", page_icon="🏗️", layout="wide")
init_session_state()

# ──────────────────────────────────────────────
# サイドバー
# ──────────────────────────────────────────────
st.sidebar.title("面談サポートアプリ")
page = st.sidebar.radio(
    "ページを選択",
    [
        "1. 事前準備＆マッチング",
        "2. 面談サポート",
        "3. 録音＆振り返り分析",
        "4. 求人データ管理",
        "5. 候補者管理",
    ],
)

# ──────────────────────────────────────────────
# ページルーティング
# ──────────────────────────────────────────────
if page == "1. 事前準備＆マッチング":
    tab1_matching.render()
elif page == "2. 面談サポート":
    tab2_support.render()
elif page == "3. 録音＆振り返り分析":
    tab3_review.render()
elif page == "4. 求人データ管理":
    tab4_jobs.render()
elif page == "5. 候補者管理":
    tab5_candidates.render()
