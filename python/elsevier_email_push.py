"""Send a daily Elsevier paper digest by email.

The script uses environment variables instead of hard-coded secrets. It can be
run manually, by Windows Task Scheduler, or by another automation runner.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import smtplib
import sqlite3
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env"
DEFAULT_QUERY = (
    '"intercity travel" OR "multilayer network" OR '
    '"multilayer transport network" OR "transport accessibility"'
)
STOPWORDS = {
    "about",
    "after",
    "among",
    "analysis",
    "approach",
    "based",
    "case",
    "data",
    "effect",
    "effects",
    "from",
    "into",
    "method",
    "model",
    "models",
    "paper",
    "research",
    "results",
    "study",
    "system",
    "than",
    "that",
    "their",
    "this",
    "through",
    "using",
    "with",
}
COLLECTION_TERM_HINTS = {
    "城际出行": [
        "intercity travel",
        "intercity mobility",
        "intercity transportation",
        "intercity commuting",
        "high speed rail",
    ],
    "多层网络": [
        "multilayer transport network",
        "multilayer transportation network",
        "multiplex transport network",
        "multimodal network",
        "public transport network",
    ],
    "交通可达性": [
        "transport accessibility",
        "transportation accessibility",
        "spatial accessibility",
        "urban accessibility",
    ],
}


@dataclass
class Paper:
    title: str
    authors: str
    publication: str
    date: str
    doi: str
    url: str
    abstract: str


def load_dotenv(path: Path = ENV_PATH) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def parse_list(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def build_query() -> str:
    query = env("ELSEVIER_QUERY")
    if query:
        return query

    zotero_query = load_zotero_collection_query()
    if zotero_query:
        return apply_domain_filter(zotero_query)

    keywords = parse_list(env("ELSEVIER_KEYWORDS"))
    if keywords:
        return apply_domain_filter(format_query_terms(keywords))

    profile_query = load_profile_keywords()
    return apply_domain_filter(profile_query) if profile_query else DEFAULT_QUERY


def format_query_terms(terms: list[str]) -> str:
    unique_terms: list[str] = []
    seen: set[str] = set()
    for raw_term in terms:
        term = raw_term.strip()
        if not term:
            continue
        normalized = term.lower()
        if normalized in seen:
            continue
        seen.add(normalized)
        unique_terms.append(f'"{term}"' if " " in term and not term.startswith('"') else term)
    return " OR ".join(unique_terms)


def apply_domain_filter(term_query: str) -> str:
    domain_terms = parse_list(env("ELSEVIER_DOMAIN_FILTER"))
    if not term_query or not domain_terms:
        return term_query
    domain_query = format_query_terms(domain_terms)
    source = env("ELSEVIER_SOURCE", "scopus").lower()
    if source == "scopus":
        return f"TITLE-ABS-KEY(({term_query}) AND ({domain_query}))"
    return f"({term_query}) AND ({domain_query})"


def load_zotero_collection_query() -> str:
    collection_names = parse_list(env("ZOTERO_COLLECTION_NAMES"))
    if not collection_names:
        return ""

    hinted_terms: list[str] = []
    for name in collection_names:
        hinted_terms.extend(COLLECTION_TERM_HINTS.get(name, []))

    db_path = find_zotero_sqlite()
    extracted_terms = extract_zotero_collection_terms(db_path, collection_names) if db_path else []
    terms = hinted_terms + extracted_terms
    limit = int(env("ZOTERO_COLLECTION_KEYWORD_LIMIT", "18"))
    return format_query_terms(terms[: max(1, limit)])


def find_zotero_sqlite() -> Path | None:
    configured = env("ZOTERO_SQLITE_PATH")
    candidates = [Path(configured)] if configured else []
    home = Path.home()
    candidates.extend(
        [
            home / "Zotero" / "zotero.sqlite",
            home / "Documents" / "Zotero" / "zotero.sqlite",
        ]
    )
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def extract_zotero_collection_terms(db_path: Path, collection_names: list[str]) -> list[str]:
    try:
        with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True) as conn:
            collection_ids = get_collection_ids(conn, collection_names)
            if not collection_ids:
                return []
            item_ids = get_collection_item_ids(conn, collection_ids)
            if not item_ids:
                return []
            texts = load_item_texts(conn, item_ids)
            return extract_terms_from_text("\n".join(texts))
    except sqlite3.Error:
        return []


def get_collection_ids(conn: sqlite3.Connection, collection_names: list[str]) -> list[int]:
    placeholders = ",".join("?" for _ in collection_names)
    rows = conn.execute(
        f"SELECT collectionID FROM collections WHERE collectionName IN ({placeholders})",
        collection_names,
    ).fetchall()
    root_ids = [int(row[0]) for row in rows]
    all_ids = set(root_ids)
    frontier = root_ids[:]
    while frontier:
        placeholders = ",".join("?" for _ in frontier)
        child_rows = conn.execute(
            f"SELECT collectionID FROM collections WHERE parentCollectionID IN ({placeholders})",
            frontier,
        ).fetchall()
        frontier = [int(row[0]) for row in child_rows if int(row[0]) not in all_ids]
        all_ids.update(frontier)
    return sorted(all_ids)


def get_collection_item_ids(conn: sqlite3.Connection, collection_ids: list[int]) -> list[int]:
    placeholders = ",".join("?" for _ in collection_ids)
    rows = conn.execute(
        f"SELECT DISTINCT itemID FROM collectionItems WHERE collectionID IN ({placeholders})",
        collection_ids,
    ).fetchall()
    return [int(row[0]) for row in rows]


def load_item_texts(conn: sqlite3.Connection, item_ids: list[int]) -> list[str]:
    if not item_ids:
        return []
    placeholders = ",".join("?" for _ in item_ids)
    field_rows = conn.execute(
        f"""
        SELECT itemData.itemID, fields.fieldName, itemDataValues.value
        FROM itemData
        JOIN fields ON fields.fieldID = itemData.fieldID
        JOIN itemDataValues ON itemDataValues.valueID = itemData.valueID
        WHERE itemData.itemID IN ({placeholders})
          AND fields.fieldName IN ('title', 'abstractNote', 'publicationTitle', 'DOI', 'url')
        """,
        item_ids,
    ).fetchall()
    tag_rows = conn.execute(
        f"""
        SELECT itemTags.itemID, tags.name
        FROM itemTags
        JOIN tags ON tags.tagID = itemTags.tagID
        WHERE itemTags.itemID IN ({placeholders})
        """,
        item_ids,
    ).fetchall()
    by_item: dict[int, list[str]] = {item_id: [] for item_id in item_ids}
    for item_id, _field_name, value in field_rows:
        if value:
            by_item[int(item_id)].append(str(value))
    for item_id, tag in tag_rows:
        if tag:
            by_item[int(item_id)].append(str(tag))
    return [" ".join(parts) for parts in by_item.values() if parts]


def extract_terms_from_text(text: str) -> list[str]:
    lowered = text.lower()
    phrase_candidates = [
        "intercity travel",
        "intercity mobility",
        "transport accessibility",
        "transportation accessibility",
        "spatial accessibility",
        "multilayer network",
        "multiplex network",
        "multimodal network",
        "complex network",
        "public transport",
        "high speed rail",
        "urban agglomeration",
        "travel behavior",
        "transportation network",
    ]
    terms = [phrase for phrase in phrase_candidates if phrase in lowered]
    tokens = re.findall(r"[a-z][a-z\-]{3,}", lowered)
    counts: dict[str, int] = {}
    for token in tokens:
        token = token.strip("-")
        if token in STOPWORDS or len(token) < 4:
            continue
        counts[token] = counts.get(token, 0) + 1
    for token, _count in sorted(counts.items(), key=lambda item: item[1], reverse=True):
        if token not in terms:
            terms.append(token)
        if len(terms) >= 18:
            break
    return terms


def load_profile_keywords() -> str:
    profile_path = env("ZOTERO_TRACKER_PROFILE_PATH")
    if not profile_path:
        return ""
    path = Path(profile_path)
    if not path.exists():
        return ""
    try:
        profile = json.loads(path.read_text(encoding="utf-8"))
        keywords = profile.get("keywords") or []
        words = [
            str(item.get("keyword", "")).strip()
            for item in keywords[:10]
            if str(item.get("keyword", "")).strip()
        ]
        return " OR ".join(words)
    except (OSError, json.JSONDecodeError):
        return ""


def request_json(url: str, api_key: str) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "X-ELS-APIKey": api_key,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Elsevier API returned {exc.code}: {body[:500]}") from exc


def search_elsevier(api_key: str, query: str, count: int, days: int, source: str) -> list[Paper]:
    endpoint = "sciencedirect" if source == "sciencedirect" else "scopus"
    candidate_count = min(200, max(count, count * int(env("ELSEVIER_CANDIDATE_MULTIPLIER", "5"))))
    page_size = min(25, int(env("ELSEVIER_PAGE_SIZE", "25")))
    entries: list[dict[str, Any]] = []
    for start in range(0, candidate_count, page_size):
        params = {
            "query": query,
            "count": str(page_size),
            "start": str(start),
            "sort": "-coverDate",
        }
        url = (
            f"https://api.elsevier.com/content/search/{endpoint}?"
            + urllib.parse.urlencode(params)
        )
        payload = request_json(url, api_key)
        page_entries = payload.get("search-results", {}).get("entry", [])
        if not page_entries:
            break
        entries.extend(page_entries)
        if len(page_entries) < page_size:
            break
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    papers = [paper for entry in entries if (paper := normalize_paper(entry))]
    recent = [paper for paper in papers if is_recent(paper.date, cutoff)]
    candidates = recent or papers
    journal_filtered = filter_by_journals(candidates)
    return (journal_filtered if journal_filtered or strict_journal_filter_enabled() else candidates)[:count]


def strict_journal_filter_enabled() -> bool:
    return env("ELSEVIER_STRICT_JOURNAL_FILTER", "true").lower() in {"1", "true", "yes", "on"}


def filter_by_journals(papers: list[Paper]) -> list[Paper]:
    journals = parse_list(env("ELSEVIER_JOURNAL_FILTER"))
    if not journals:
        return papers
    normalized_journals = [normalize_journal_name(journal) for journal in journals]
    result = []
    for paper in papers:
        publication = normalize_journal_name(paper.publication)
        if any(matches_journal(publication, journal) for journal in normalized_journals):
            result.append(paper)
    return result


def normalize_journal_name(value: str) -> str:
    value = value.lower().replace("&", " and ")
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def matches_journal(publication: str, target: str) -> bool:
    if not publication or not target:
        return False
    if publication == target:
        return True
    target_words = len(target.split())
    publication_words = len(publication.split())
    if min(target_words, publication_words) >= 4:
        return publication.startswith(target) or target.startswith(publication)
    return False


def is_recent(date_text: str, cutoff: datetime) -> bool:
    if not date_text:
        return False
    for fmt in ("%Y-%m-%d", "%Y-%m", "%Y"):
        try:
            parsed = datetime.strptime(date_text[: len(fmt)], fmt).replace(tzinfo=timezone.utc)
            return parsed >= cutoff
        except ValueError:
            continue
    return False


def normalize_paper(entry: dict[str, Any]) -> Paper | None:
    title = first(entry, "dc:title", "prism:title", "title")
    if not title:
        return None
    authors = normalize_authors(entry)
    doi = first(entry, "prism:doi", "dc:identifier")
    if doi.startswith("DOI:"):
        doi = doi[4:]
    url = first(entry, "prism:url", "link")
    if isinstance(entry.get("link"), list):
        for link in entry["link"]:
            if isinstance(link, dict) and link.get("@href"):
                url = link["@href"]
                break
    if not url and doi:
        url = f"https://doi.org/{doi}"
    return Paper(
        title=title,
        authors=authors or "Unknown authors",
        publication=first(entry, "prism:publicationName", "prism:aggregationType"),
        date=first(entry, "prism:coverDate", "prism:coverDisplayDate", "load-date"),
        doi=doi,
        url=url,
        abstract=first(entry, "dc:description", "description"),
    )


def first(entry: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = entry.get(key)
        if isinstance(value, str) and value.strip():
            return value.replace("\xa0", " ").strip()
    return ""


def normalize_authors(entry: dict[str, Any]) -> str:
    creators = entry.get("dc:creator")
    if isinstance(creators, str):
        return creators
    authors = entry.get("authors", {}).get("author") if isinstance(entry.get("authors"), dict) else None
    if isinstance(authors, list):
        names = [first(author, "authname", "surname", "given-name") for author in authors]
        return ", ".join(name for name in names if name)
    return ""


def dedupe_papers(papers: list[Paper]) -> list[Paper]:
    seen: set[str] = set()
    result: list[Paper] = []
    for paper in papers:
        key = (paper.doi or paper.title).lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(paper)
    return result


def render_email(papers: list[Paper], query: str, source: str) -> tuple[str, str, str]:
    today = datetime.now().strftime("%Y-%m-%d")
    subject = f"Elsevier 文献推送 - {today} - {len(papers)} 篇"
    if not papers:
        text = f"今日没有检索到新的 Elsevier 文献。\n\n检索源: {source}\n检索式: {query}\n"
        html_body = f"""
        <html><body>
          <h2>Elsevier 文献推送 - {html.escape(today)}</h2>
          <p>今日没有检索到新的 Elsevier 文献。</p>
          <p><strong>检索源：</strong>{html.escape(source)}</p>
          <p><strong>检索式：</strong>{html.escape(query)}</p>
        </body></html>
        """
        return subject, text, html_body

    rows = []
    text_lines = [f"Elsevier 文献推送 - {today}", f"检索源: {source}", f"检索式: {query}", ""]
    for index, paper in enumerate(papers, start=1):
        link = paper.url or (f"https://doi.org/{paper.doi}" if paper.doi else "")
        text_lines.extend(
            [
                f"{index}. {paper.title}",
                f"   作者: {paper.authors}",
                f"   期刊/来源: {paper.publication or '-'}",
                f"   日期: {paper.date or '-'}",
                f"   DOI: {paper.doi or '-'}",
                f"   链接: {link or '-'}",
                "",
            ]
        )
        rows.append(
            f"""
            <article style="margin:0 0 18px 0;padding:14px;border:1px solid #ddd;border-radius:8px;">
              <h3 style="margin:0 0 8px 0;font-size:16px;">{index}. {html.escape(paper.title)}</h3>
              <p style="margin:4px 0;color:#444;"><strong>作者：</strong>{html.escape(paper.authors)}</p>
              <p style="margin:4px 0;color:#444;"><strong>期刊/来源：</strong>{html.escape(paper.publication or "-")}</p>
              <p style="margin:4px 0;color:#444;"><strong>日期：</strong>{html.escape(paper.date or "-")}</p>
              <p style="margin:4px 0;color:#444;"><strong>DOI：</strong>{html.escape(paper.doi or "-")}</p>
              {f'<p style="margin:8px 0;"><a href="{html.escape(link)}">打开论文页面</a></p>' if link else ''}
              {f'<p style="margin:8px 0;color:#555;">{html.escape(paper.abstract[:700])}</p>' if paper.abstract else ''}
            </article>
            """
        )
    html_body = f"""
    <html><body style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.5;">
      <h2>Elsevier 文献推送 - {html.escape(today)}</h2>
      <p><strong>检索源：</strong>{html.escape(source)} &nbsp; <strong>检索式：</strong>{html.escape(query)}</p>
      {''.join(rows)}
    </body></html>
    """
    return subject, "\n".join(text_lines), html_body


def send_email(subject: str, text_body: str, html_body: str) -> None:
    smtp_host = env("SMTP_HOST", "smtp.163.com")
    smtp_port = int(env("SMTP_PORT", "465"))
    sender = env("SMTP_USER")
    password = env("SMTP_PASSWORD")
    recipients = parse_list(env("MAIL_TO") or sender)
    if not sender or not password or not recipients:
        raise RuntimeError("Missing SMTP_USER, SMTP_PASSWORD, or MAIL_TO in .env")

    final = MIMEMultipart("alternative")
    final["Subject"] = subject
    final["From"] = sender
    final["To"] = ", ".join(recipients)
    final.attach(MIMEText(text_body, "plain", "utf-8"))
    final.attach(MIMEText(html_body, "html", "utf-8"))

    context = ssl.create_default_context()
    with smtplib.SMTP_SSL(smtp_host, smtp_port, context=context) as server:
        server.login(sender, password)
        server.sendmail(sender, recipients, final.as_string())


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    load_dotenv()
    parser = argparse.ArgumentParser(description="Send Elsevier paper recommendations to email.")
    parser.add_argument("--dry-run", action="store_true", help="Print the digest instead of sending email.")
    args = parser.parse_args()

    api_key = env("ELSEVIER_API_KEY")
    if not api_key:
        raise RuntimeError("Missing ELSEVIER_API_KEY in .env")

    source = env("ELSEVIER_SOURCE", "scopus").lower()
    if source not in {"scopus", "sciencedirect"}:
        source = "scopus"
    count = int(env("ELSEVIER_MAX_RESULTS", "20"))
    days = int(env("ELSEVIER_DAYS", "7"))
    query = build_query()
    papers = dedupe_papers(search_elsevier(api_key, query, count, days, source))
    subject, text_body, html_body = render_email(papers, query, source)

    if args.dry_run:
        print(subject)
        print(text_body)
        return 0

    send_email(subject, text_body, html_body)
    print(f"Sent {len(papers)} Elsevier papers to {env('MAIL_TO') or env('SMTP_USER')}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
