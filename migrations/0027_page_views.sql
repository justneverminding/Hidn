-- Daily page-view totals for the private metrics page. Counts only: a day, a
-- page group, the referring site and a country. No IP, cookie, user agent or
-- identifier is stored, and private link slugs and post ids are never recorded
-- (they are folded into "/to/:link" and "/c/:post").
CREATE TABLE IF NOT EXISTS hidn_page_views (
  day TEXT NOT NULL,
  page TEXT NOT NULL,
  source TEXT NOT NULL,
  country TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, page, source, country)
);
