"""タブ4：求人データ管理（CSV編集UI）"""

import streamlit as st
import pandas as pd
from utils import load_jobs, save_jobs


def render() -> None:
    st.header("求人データ管理")
    st.caption("jobs.csv の閲覧・追加・編集・削除をアプリ内から行えます。")

    jobs_df = load_jobs()

    # ── 一覧表示（編集可能） ──
    st.subheader(f"求人一覧（{len(jobs_df)}件）")
    edited_df = st.data_editor(
        jobs_df,
        use_container_width=True,
        num_rows="dynamic",
        key="jobs_editor",
    )

    col1, col2 = st.columns(2)
    with col1:
        if st.button("変更を保存", type="primary"):
            save_jobs(edited_df)
            st.success("jobs.csv を保存しました。")
            st.rerun()
    with col2:
        csv_data = edited_df.to_csv(index=False).encode("utf-8")
        st.download_button(
            "CSVダウンロード",
            data=csv_data,
            file_name="jobs.csv",
            mime="text/csv",
        )

    # ── CSVアップロードで一括差し替え ──
    st.divider()
    st.subheader("CSVアップロード（一括差し替え）")
    uploaded = st.file_uploader("CSVファイルを選択", type=["csv"], key="csv_upload")
    if uploaded is not None:
        try:
            new_df = pd.read_csv(uploaded)
            required_cols = {"企業名", "職種", "年収", "必須要件", "休日", "アピールポイント"}
            if not required_cols.issubset(set(new_df.columns)):
                missing = required_cols - set(new_df.columns)
                st.error(f"必須カラムが不足しています: {missing}")
            else:
                st.dataframe(new_df, use_container_width=True)
                if st.button("このCSVで上書き保存"):
                    save_jobs(new_df)
                    st.success(f"jobs.csv を {len(new_df)}件のデータで更新しました。")
                    st.rerun()
        except Exception as e:
            st.error(f"CSVの読み込みに失敗しました: {e}")
