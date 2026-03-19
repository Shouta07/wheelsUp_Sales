"""タブ0：売上ダッシュボード（パイプライン・KPI・フォロー漏れ検知）"""

import os
import json
from datetime import datetime, timedelta

import streamlit as st
import pandas as pd
from utils import load_jobs

CANDIDATES_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "candidates.json")


def _load_candidates() -> list[dict]:
    if os.path.exists(CANDIDATES_FILE):
        with open(CANDIDATES_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def render() -> None:
    st.header("売上ダッシュボード")

    candidates = _load_candidates()
    jobs_df = load_jobs()

    if not candidates:
        st.info("候補者がまだ登録されていません。「候補者管理」→「新規登録」から始めてください。")
        return

    today = datetime.now().date()

    # ──────────────────────────────────────────
    # KPI サマリー
    # ──────────────────────────────────────────
    status_counts = {}
    for c in candidates:
        s = c.get("ステータス", "不明")
        status_counts[s] = status_counts.get(s, 0) + 1

    total = len(candidates)
    active = status_counts.get("対応中", 0)
    interviewed = status_counts.get("面談済み", 0)
    introduced = status_counts.get("紹介済み", 0)
    offered = status_counts.get("内定", 0)
    placed = status_counts.get("入社", 0)
    declined = status_counts.get("辞退", 0)

    st.subheader("パイプライン")
    cols = st.columns(6)
    cols[0].metric("対応中", active)
    cols[1].metric("面談済み", interviewed)
    cols[2].metric("紹介済み", introduced)
    cols[3].metric("内定", offered)
    cols[4].metric("入社（成約）", placed)
    cols[5].metric("辞退", declined)

    # 転換率
    st.subheader("転換率")
    conv_cols = st.columns(4)
    total_active = active + interviewed + introduced + offered + placed + declined
    if total_active > 0:
        conv_cols[0].metric(
            "面談→紹介率",
            f"{(introduced + offered + placed) / max(interviewed + introduced + offered + placed, 1) * 100:.0f}%",
        )
        conv_cols[1].metric(
            "紹介→内定率",
            f"{(offered + placed) / max(introduced + offered + placed, 1) * 100:.0f}%" if (introduced + offered + placed) > 0 else "-",
        )
        conv_cols[2].metric(
            "内定→入社率",
            f"{placed / max(offered + placed, 1) * 100:.0f}%" if (offered + placed) > 0 else "-",
        )
        conv_cols[3].metric(
            "全体成約率",
            f"{placed / total * 100:.1f}%",
        )

    # ──────────────────────────────────────────
    # フォロー漏れアラート
    # ──────────────────────────────────────────
    st.divider()
    st.subheader("フォロー漏れアラート")

    alerts = []
    for c in candidates:
        status = c.get("ステータス", "")
        if status in ["辞退", "入社", "保留"]:
            continue

        name = c.get("名前", "不明")
        history = c.get("面談履歴", [])

        # ネクストアクション期限チェック
        if history:
            last = history[-1]
            next_action = last.get("ネクストアクション", "")
            deadline = last.get("期限日")
            last_date_str = last.get("日付", "")

            if deadline:
                try:
                    dl = datetime.strptime(deadline, "%Y-%m-%d").date()
                    if dl < today:
                        days_over = (today - dl).days
                        alerts.append({
                            "種類": "期限超過",
                            "候補者": name,
                            "ステータス": status,
                            "内容": f"「{next_action}」の期限を{days_over}日超過",
                            "緊急度": "高" if days_over >= 3 else "中",
                        })
                    elif dl == today:
                        alerts.append({
                            "種類": "本日期限",
                            "候補者": name,
                            "ステータス": status,
                            "内容": f"本日が「{next_action}」の期限",
                            "緊急度": "高",
                        })
                except ValueError:
                    pass

            # 最終接触から一定期間経過
            if last_date_str:
                try:
                    last_date = datetime.strptime(last_date_str, "%Y-%m-%d").date()
                    days_since = (today - last_date).days
                    if days_since >= 14:
                        alerts.append({
                            "種類": "長期未接触",
                            "候補者": name,
                            "ステータス": status,
                            "内容": f"最終面談から{days_since}日経過（{last_date_str}）",
                            "緊急度": "高" if days_since >= 21 else "中",
                        })
                    elif days_since >= 7:
                        alerts.append({
                            "種類": "要フォロー",
                            "候補者": name,
                            "ステータス": status,
                            "内容": f"最終面談から{days_since}日経過",
                            "緊急度": "低",
                        })
                except ValueError:
                    pass
        else:
            # 面談履歴なし → 登録だけして放置
            reg_date_str = c.get("登録日", "")
            if reg_date_str:
                try:
                    reg_date = datetime.strptime(reg_date_str, "%Y-%m-%d").date()
                    days_since = (today - reg_date).days
                    if days_since >= 3:
                        alerts.append({
                            "種類": "未着手",
                            "候補者": name,
                            "ステータス": status,
                            "内容": f"登録後{days_since}日経過、面談未実施",
                            "緊急度": "高" if days_since >= 7 else "中",
                        })
                except ValueError:
                    pass

    if alerts:
        # 緊急度でソート
        priority_order = {"高": 0, "中": 1, "低": 2}
        alerts.sort(key=lambda a: priority_order.get(a["緊急度"], 3))

        high_count = sum(1 for a in alerts if a["緊急度"] == "高")
        if high_count > 0:
            st.error(f"緊急度「高」のアラートが {high_count}件 あります")

        alert_df = pd.DataFrame(alerts)
        st.dataframe(
            alert_df,
            use_container_width=True,
            column_config={
                "緊急度": st.column_config.TextColumn(
                    width="small",
                ),
            },
        )
    else:
        st.success("フォロー漏れはありません。")

    # ──────────────────────────────────────────
    # 今日やること
    # ──────────────────────────────────────────
    st.divider()
    st.subheader("今日のアクションリスト")

    actions = []
    for c in candidates:
        status = c.get("ステータス", "")
        if status in ["辞退", "入社", "保留"]:
            continue

        name = c.get("名前", "不明")
        history = c.get("面談履歴", [])

        if history:
            last = history[-1]
            next_action = last.get("ネクストアクション", "")
            deadline = last.get("期限日")

            if next_action:
                # 期限が今日 or 超過 or 未設定（対応中なら表示）
                show = False
                if deadline:
                    try:
                        dl = datetime.strptime(deadline, "%Y-%m-%d").date()
                        if dl <= today:
                            show = True
                    except ValueError:
                        show = True
                elif status in ["対応中", "面談済み"]:
                    show = True

                if show:
                    actions.append({
                        "候補者": name,
                        "ステータス": status,
                        "アクション": next_action,
                        "期限": deadline or "未設定",
                    })

    if actions:
        for a in actions:
            deadline_text = f"（期限: {a['期限']}）" if a["期限"] != "未設定" else ""
            st.checkbox(
                f"**{a['候補者']}** [{a['ステータス']}]: {a['アクション']} {deadline_text}",
                key=f"action_{a['候補者']}",
            )
    else:
        st.info("現在期限内のアクションはありません。")

    # ──────────────────────────────────────────
    # 稼働状況
    # ──────────────────────────────────────────
    st.divider()
    st.subheader("求人稼働状況")
    st.caption(f"求人DB: {len(jobs_df)}件")

    # ステータス別の候補者を企業ごとに集計
    company_stats = {}
    for c in candidates:
        history = c.get("面談履歴", [])
        for h in history:
            proposed = h.get("提案企業", "")
            if proposed:
                for company in [co.strip() for co in proposed.replace("、", ",").split(",")]:
                    if company:
                        if company not in company_stats:
                            company_stats[company] = {"紹介数": 0, "候補者名": []}
                        company_stats[company]["紹介数"] += 1
                        name = c.get("名前", "")
                        if name and name not in company_stats[company]["候補者名"]:
                            company_stats[company]["候補者名"].append(name)

    if company_stats:
        stats_data = [
            {"企業名": k, "紹介候補者数": v["紹介数"], "候補者": ", ".join(v["候補者名"])}
            for k, v in sorted(company_stats.items(), key=lambda x: x[1]["紹介数"], reverse=True)
        ]
        st.dataframe(pd.DataFrame(stats_data), use_container_width=True)
    else:
        st.info("まだ企業への紹介実績がありません。")
