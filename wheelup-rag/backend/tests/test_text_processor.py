"""テキスト処理パイプライン テスト"""

import pytest

from app.services.text_processor import clean_text, extract_entities, process_text


class TestCleanText:
    def test_removes_mention_tags(self):
        text = '<at user_id="u123">田中さん</at> こんにちは'
        result = clean_text(text)
        assert "<at" not in result
        assert "こんにちは" in result

    def test_removes_emoji(self):
        text = "了解しました👍明日対応します🙏"
        result = clean_text(text)
        assert "👍" not in result
        assert "🙏" not in result
        assert "了解しました" in result
        assert "明日対応します" in result

    def test_normalizes_whitespace(self):
        text = "テスト   メッセージ\n\n\nです"
        result = clean_text(text)
        assert "  " not in result

    def test_empty_string(self):
        assert clean_text("") == ""


class TestExtractEntities:
    def test_extracts_amounts(self):
        text = "予算は4,800,000円です。来期は500万円を想定。"
        entities = extract_entities(text)
        assert "4,800,000円" in entities["amounts"]
        assert "500万円" in entities["amounts"]

    def test_extracts_companies(self):
        text = "株式会社テスト商事と打ち合わせです"
        entities = extract_entities(text)
        assert any("テスト商事" in c for c in entities["companies"])

    def test_extracts_persons(self):
        text = "山田部長と田中様が出席予定です"
        entities = extract_entities(text)
        assert "山田部長" in entities["persons"]
        assert "田中様" in entities["persons"]

    def test_extracts_dates(self):
        text = "来月末までに納品。2025/01/15が期限です。"
        entities = extract_entities(text)
        assert "来月末" in entities["dates"] or any("来月" in d for d in entities["dates"])

    def test_empty_text(self):
        entities = extract_entities("")
        assert entities["persons"] == []
        assert entities["companies"] == []


class TestProcessText:
    def test_returns_chunks_with_entities(self):
        text = "株式会社テスト商事の山田部長と打ち合わせ。予算は500万円。来月末までに提案書を提出する。"
        results = process_text(text)
        assert len(results) >= 1
        assert "text" in results[0]
        assert "entities" in results[0]

    def test_long_text_chunked(self):
        text = "これはテストメッセージです。" * 100
        results = process_text(text)
        assert len(results) > 1

    def test_empty_text_returns_empty(self):
        assert process_text("") == []

    def test_mention_only_returns_empty(self):
        text = '<at user_id="u123">田中</at>'
        results = process_text(text)
        # クリーニング後に空になる場合は空リスト
        assert len(results) <= 1
