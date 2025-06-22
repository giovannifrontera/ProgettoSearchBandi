CREATE TABLE schools (
  id INT AUTO_INCREMENT PRIMARY KEY,
  codice_mecc VARCHAR(12) UNIQUE,
  denominazione VARCHAR(255),
  regione VARCHAR(100),
  provincia VARCHAR(100),
  comune VARCHAR(100),
  sito_web VARCHAR(255),
  tipologia VARCHAR(50)
);

CREATE TABLE tenders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_id INT,
  title VARCHAR(500),
  type VARCHAR(100),
  deadline DATE,
  publish_date DATE,
  url TEXT,
  summary TEXT,
  last_checked DATETIME,
  UNIQUE key_uni (school_id, url(255)),
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
);
