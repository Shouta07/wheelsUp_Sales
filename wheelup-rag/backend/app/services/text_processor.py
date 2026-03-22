"""テキスト処理パイプライン — クリーニング・チャンキング・エンティティ抽出"""

import re

from langchain_text_splitters import RecursiveCharacterTextSplitter

# チャンキング設定
_splitter = RecursiveCharacterTextSplitter(
    chunk_size=500,
    chunk_overlap=50,
    separators=["\n\n", "\n", "。", "、", " ", ""],
)

# エンティティ抽出用パターン
_AMOUNT_PATTERN = re.compile(r"[\d,]+(?:万)?円")
_DATE_PATTERN = re.compile(
    r"(?:来月|今月|先月|来週|今週|先週|来年|今年|去年)"
    r"|(?:\d{4}[/\-年]\d{1,2}[/\-月]\d{1,2}日?)"
    r"|(?:\d{1,2}[/\-月]\d{1,2}日?)"
    r"|(?:\d{1,2}月末)"
)
_COMPANY_PATTERN = re.compile(r"(?:株式会社|有限会社|合同会社).{1,20}|.{1,20}(?:株式会社|有限会社|合同会社)")
_PERSON_PATTERN = re.compile(r"[\u4e00-\u9fff]{1,4}(?:部長|課長|係長|主任|社長|取締役|マネージャー|リーダー|さん|様|氏)")
_MENTION_PATTERN = re.compile(r"<at[^>]*>.*?</at>")
_EMOJI_PATTERN = re.compile(
    r"[\U0001f600-\U0001f64f\U0001f300-\U0001f5ff\U0001f680-\U0001f6ff"
    r"\U0001f1e0-\U0001f1ff\U00002702-\U000027b0\U0001f900-\U0001f9ff"
    r"\U0001fa70-\U0001faff\U00002600-\U000026ff]",
    flags=re.UNICODE,
)


def clean_text(text: str) -> str:
    """メンションタグ・絵文字を除去し、URL を正規化する。"""
    text = _MENTION_PATTERN.sub("", text)
    text = _EMOJI_PATTERN.sub("", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def extract_entities(text: str) -> dict:
    """テキストから企業名・人名・金額・日付・キーワードを抽出する。"""
    return {
        "products": [],  # 製品名は辞書マッチで後から拡張
        "persons": list(set(_PERSON_PATTERN.findall(text))),
        "companies": list(set(_COMPANY_PATTERN.findall(text))),
        "amounts": list(set(_AMOUNT_PATTERN.findall(text))),
        "dates": list(set(_DATE_PATTERN.findall(text))),
        "keywords": [],  # キーワード抽出は TF-IDF/LLM で拡張可能
    }


def process_text(raw_text: str) -> list[dict]:
    """生テキストをクリーニング → チャンキング → エンティティ抽出して返す。

    Returns:
        list[dict]: [{"text": str, "entities": dict}, ...]
    """
    cleaned = clean_text(raw_text)
    if not cleaned:
        return []

    chunks = _splitter.split_text(cleaned)
    results = []
    for chunk in chunks:
        entities = extract_entities(chunk)
        results.append({"text": chunk, "entities": entities})

    return results
