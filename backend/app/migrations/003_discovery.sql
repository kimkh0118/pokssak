CREATE TABLE discovery_frontier (
 source_url TEXT NOT NULL,
 url TEXT NOT NULL,
 depth INTEGER NOT NULL,
 title TEXT NOT NULL,
 priority INTEGER NOT NULL DEFAULT 0,
 last_visit TEXT,
 PRIMARY KEY(source_url,url)
);
CREATE INDEX discovery_due ON discovery_frontier(source_url,last_visit,priority);
CREATE TABLE collection_reports (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 agency TEXT NOT NULL,
 source_url TEXT NOT NULL,
 report TEXT NOT NULL,
 created_at TEXT NOT NULL
);
