from app.taxonomy.matcher import match_skills


def test_match_skills_finds_react_and_typescript():
    text = "Skills: HTML, CSS, JavaScript, React, TypeScript, Git, REST API"
    ids = {s.id for s in match_skills(text)}
    assert "react" in ids
    assert "typescript" in ids
    assert "javascript" in ids
    assert "rest_api" in ids


def test_match_skills_handles_aliases():
    text = "Backed by k8s on AWS with Postgres."
    ids = {s.id for s in match_skills("Used PG and Mongo with NextJS")}
    assert "postgresql" in ids
    assert "mongodb" in ids
    assert "nextjs" in ids
    assert "kubernetes" in {s.id for s in match_skills(text)}


def test_match_skills_empty_text():
    assert match_skills("") == []
