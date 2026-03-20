"""タブ4：求人データ管理（CSV編集UI）"""

import streamlit as st
import pandas as pd
from utils import load_jobs, save_jobs, validate_csv_upload


def render() -> None:
    st.header("求人データ管理")
    st.caption("求人情報と実績データを管理します。実績を更新するほどAIの提案精度が向上します。")

    jobs_df = load_jobs()

    # ── 実績サマリー ──
    if "紹介数" in jobs_df.columns:
        total_refs = int(jobs_df["紹介数"].fillna(0).astype(int).sum())
        total_wins = int(jobs_df["成約数"].fillna(0).astype(int).sum())
        active_companies = int((jobs_df["紹介数"].fillna(0).astype(int) > 0).sum())

        col1, col2, col3 = st.columns(3)
        with col1:
            st.metric("総紹介数", f"{total_refs}件")
        with col2:
            st.metric("総成約数", f"{total_wins}件")
        with col3:
            rate = f"{total_wins / total_refs * 100:.0f}%" if total_refs > 0 else "---"
            st.metric("全体成約率", rate)

        if active_companies > 0:
            st.caption(f"{active_companies}社に実績データあり。Pipedriveの結果を「紹介数」「成約数」「候補者傾向メモ」に反映してください。")
        else:
            st.info("Pipedriveから各企業の紹介数・成約数を転記すると、マッチング精度が向上します。下の表で直接編集できます。")

    # ── 一覧表示（編集可能） ──
    st.subheader(f"求人一覧（{len(jobs_df)}件）")

    # 実績カラムの列設定
    column_config = {}
    if "紹介数" in jobs_df.columns:
        column_config["紹介数"] = st.column_config.NumberColumn("紹介数", help="Pipedriveの紹介実績を転記", min_value=0, step=1)
        column_config["成約数"] = st.column_config.NumberColumn("成約数", help="Pipedriveの成約実績を転記", min_value=0, step=1)
        column_config["候補者傾向メモ"] = st.column_config.TextColumn("候補者傾向メモ", help="例：若手サブコン出身者に人気、年収重視の人は辞退傾向", width="large")

    edited_df = st.data_editor(
        jobs_df,
        use_container_width=True,
        num_rows="dynamic",
        column_config=column_config,
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
        valid, err_msg, new_df = validate_csv_upload(uploaded)
        if not valid:
            st.error(err_msg)
        else:
            st.dataframe(new_df, use_container_width=True)
            if st.button("このCSVで上書き保存"):
                save_jobs(new_df)
                st.success(f"jobs.csv を {len(new_df)}件のデータで更新しました。")
                st.rerun()
