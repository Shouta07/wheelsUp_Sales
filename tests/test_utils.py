"""utils.py のユニットテスト（API依存なし）"""

import os
import sys
import io
import tempfile
import shutil

import pandas as pd
import pytest

# プロジェクトルートをパスに追加
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# google.generativeai がインストールされていない環境でもテスト可能にする
from unittest import mock

# genai モックを先に注入してからインポート
mock_genai = mock.MagicMock()
sys.modules["google"] = mock.MagicMock()
sys.modules["google.generativeai"] = mock_genai

# streamlit もモック化（テスト環境では不要）
mock_st = mock.MagicMock()
mock_st.session_state = {}
mock_st.secrets = {}
sys.modules["streamlit"] = mock_st

from utils import (
    validate_text_input,
    validate_csv_upload,
    load_jobs,
    save_jobs,
    _cache_key,
    REQUIRED_JOB_COLS,
    MAX_INPUT_LENGTH,
    MAX_CSV_ROWS,
    JOBS_CSV,
)


# ──────────────────────────────────────────────
# validate_text_input
# ──────────────────────────────────────────────
class TestValidateTextInput:
    def test_empty_string(self):
        valid, msg = validate_text_input("")
        assert not valid
        assert "入力" in msg

    def test_whitespace_only(self):
        valid, msg = validate_text_input("   ")
        assert not valid

    def test_none_input(self):
        valid, msg = validate_text_input(None)
        assert not valid

    def test_valid_input(self):
        valid, msg = validate_text_input("候補者：32歳、施工管理5年")
        assert valid
        assert msg == ""

    def test_too_long(self):
        long_text = "あ" * (MAX_INPUT_LENGTH + 1)
        valid, msg = validate_text_input(long_text)
        assert not valid
        assert "文字以内" in msg

    def test_custom_field_name(self):
        valid, msg = validate_text_input("", "候補者情報")
        assert "候補者情報" in msg

    def test_custom_max_length(self):
        valid, msg = validate_text_input("12345", max_length=3)
        assert not valid
        assert "3文字以内" in msg

    def test_exact_max_length(self):
        valid, msg = validate_text_input("あ" * MAX_INPUT_LENGTH)
        assert valid


# ──────────────────────────────────────────────
# validate_csv_upload
# ──────────────────────────────────────────────
class TestValidateCsvUpload:
    def _make_csv_file(self, content: str):
        return io.BytesIO(content.encode("utf-8"))

    def test_none_file(self):
        valid, msg, df = validate_csv_upload(None)
        assert not valid
        assert "選択" in msg

    def test_valid_csv(self):
        csv = "企業名,職種,年収,必須要件,休日,アピールポイント\nテスト社,施工管理,500万,資格,土日,福利厚生\n"
        f = self._make_csv_file(csv)
        valid, msg, df = validate_csv_upload(f)
        assert valid
        assert df is not None
        assert len(df) == 1

    def test_missing_columns(self):
        csv = "企業名,職種\nテスト社,施工管理\n"
        f = self._make_csv_file(csv)
        valid, msg, df = validate_csv_upload(f)
        assert not valid
        assert "必須カラム" in msg

    def test_empty_company_name(self):
        csv = "企業名,職種,年収,必須要件,休日,アピールポイント\n,施工管理,500万,資格,土日,福利厚生\n"
        f = self._make_csv_file(csv)
        valid, msg, df = validate_csv_upload(f)
        assert not valid
        assert "企業名が空" in msg

    def test_too_many_rows(self):
        header = "企業名,職種,年収,必須要件,休日,アピールポイント\n"
        rows = "テスト社,施工管理,500万,資格,土日,福利厚生\n" * (MAX_CSV_ROWS + 1)
        f = self._make_csv_file(header + rows)
        valid, msg, df = validate_csv_upload(f)
        assert not valid
        assert "行数" in msg


# ──────────────────────────────────────────────
# load_jobs / save_jobs
# ──────────────────────────────────────────────
class TestLoadSaveJobs:
    def test_load_existing_jobs(self):
        if os.path.exists(JOBS_CSV):
            df = load_jobs()
            assert isinstance(df, pd.DataFrame)
            assert not df.empty

    def test_load_missing_returns_empty(self):
        """存在しないファイルの場合は空のDataFrameを返す"""
        import utils
        original = utils.JOBS_CSV
        utils.JOBS_CSV = "/tmp/nonexistent_test_jobs.csv"
        original_template = utils.JOBS_TEMPLATE
        utils.JOBS_TEMPLATE = "/tmp/nonexistent_template.csv"
        try:
            df = load_jobs()
            assert isinstance(df, pd.DataFrame)
            assert df.empty
        finally:
            utils.JOBS_CSV = original
            utils.JOBS_TEMPLATE = original_template

    def test_save_creates_backup(self):
        if not os.path.exists(JOBS_CSV):
            pytest.skip("jobs.csv が存在しません")
        df = load_jobs()
        save_jobs(df)
        assert os.path.exists(JOBS_CSV + ".bak")


# ──────────────────────────────────────────────
# _cache_key
# ──────────────────────────────────────────────
class TestCacheKey:
    def test_deterministic(self):
        key1 = _cache_key("prompt1", "system1")
        key2 = _cache_key("prompt1", "system1")
        assert key1 == key2

    def test_different_inputs(self):
        key1 = _cache_key("prompt1", "system1")
        key2 = _cache_key("prompt2", "system1")
        assert key1 != key2

    def test_returns_md5_hex(self):
        key = _cache_key("p", "s")
        assert isinstance(key, str)
        assert len(key) == 32
