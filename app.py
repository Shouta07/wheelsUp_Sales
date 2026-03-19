"""
オールインワン面談サポートアプリ
人材紹介エージェント向け：ダッシュボード・事前準備・面談サポート・振り返り分析
"""

import streamlit as st
from utils import init_session_state
from tabs import tab0_dashboard, tab1_matching, tab2_support, tab3_review, tab4_jobs, tab5_candidates

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
        "ダッシュボード",
        "事前準備＆マッチング",
        "面談サポート",
        "面談振り返り",
        "候補者管理",
        "求人データ管理",
    ],
)

# ──────────────────────────────────────────────
# ページルーティング
# ──────────────────────────────────────────────
if page == "ダッシュボード":
    tab0_dashboard.render()
elif page == "事前準備＆マッチング":
    tab1_matching.render()
elif page == "面談サポート":
    tab2_support.render()
elif page == "面談振り返り":
    tab3_review.render()
elif page == "候補者管理":
    tab5_candidates.render()
elif page == "求人データ管理":
    tab4_jobs.render()
